const mongoose = require("mongoose");
const {
  RiderUser,
  RiderProfile,
  Zone,
  Vehicle,
  FileRecord,
  RiderDocument,
  KycRecord,
  SelfieCheck,
  KitAddress,
  InsuranceNominee,
  BankAccount,
  KitOrder,
  InsuranceEnrollment,
} = require("../models");
const AppError = require("../lib/AppError");
const { recordAudit } = require("../lib/audit");
const { storageProvider } = require("../adapters");
const { deliveryEnv } = require("../config/env");

async function listRiders({ status, q, page = 1, limit = 20 }) {
  const parsedPage = Math.max(1, parseInt(page, 10) || 1);
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const skip = (parsedPage - 1) * parsedLimit;

  const profileFilter = {};
  if (status) {
    profileFilter.status = status;
  }

  if (q && typeof q === "string" && q.trim().length > 0) {
    const escaped = q.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const userMatches = await RiderUser.find({
      $or: [
        { email: { $regex: `^${escaped}`, $options: "i" } },
        { phone: { $regex: `^${escaped}` } },
      ],
    }).select("_id");

    const matchedUserIds = userMatches.map((u) => u._id);

    profileFilter.$or = [
      { referenceNumber: { $regex: `^${escaped}`, $options: "i" } },
      { fullName: { $regex: `^${escaped}`, $options: "i" } },
      { userId: { $in: matchedUserIds } },
    ];
  }

  const [profiles, total] = await Promise.all([
    RiderProfile.find(profileFilter)
      .sort({ submittedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    RiderProfile.countDocuments(profileFilter),
  ]);

  const zoneIds = [...new Set(profiles.map((p) => p.zoneId).filter(Boolean))];
  const zones = await Zone.find({ _id: { $in: zoneIds } }).lean();
  const zoneMap = new Map(zones.map((z) => [z._id, z.name]));

  const items = profiles.map((p) => ({
    riderId: p.userId.toString(),
    referenceNumber: p.referenceNumber,
    name: p.fullName,
    rideType: p.rideType,
    zoneName: zoneMap.get(p.zoneId) || null,
    status: p.status,
    submittedAt: p.submittedAt,
  }));

  return {
    items,
    page: parsedPage,
    limit: parsedLimit,
    total,
  };
}

async function getRiderDetail(adminId, riderId) {
  const user = await RiderUser.findById(riderId).lean();
  if (!user) {
    throw new AppError("NOT_FOUND", 404, "Rider not found");
  }

  const [
    profile,
    vehicle,
    documents,
    kyc,
    selfie,
    kitAddress,
    nominee,
    bank,
  ] = await Promise.all([
    RiderProfile.findOne({ userId: riderId }).lean(),
    Vehicle.findOne({ riderId }).lean(),
    RiderDocument.find({ riderId }).lean(),
    KycRecord.findOne({ riderId }).lean(),
    SelfieCheck.findOne({ riderId }).sort({ createdAt: -1 }).lean(),
    KitAddress.findOne({ riderId }).lean(),
    InsuranceNominee.findOne({ riderId }).lean(),
    BankAccount.findOne({ riderId }).lean(),
  ]);

  // Sign file URLs (valid 10 minutes)
  const fileIds = [];
  if (kyc?.documentFileId) fileIds.push(kyc.documentFileId);
  if (selfie?.fileId) fileIds.push(selfie.fileId);
  if (bank?.passbookFileId) fileIds.push(bank.passbookFileId);
  for (const d of documents || []) {
    if (d.fileId) fileIds.push(d.fileId);
  }

  const files = await FileRecord.find({ _id: { $in: fileIds } }).lean();
  const fileMap = new Map();
  for (const f of files) {
    fileMap.set(f._id.toString(), {
      fileId: f._id.toString(),
      purpose: f.purpose,
      url: storageProvider.signedUrl(f.storageKey, 600),
    });
  }

  let zoneName = null;
  if (profile?.zoneId) {
    const zone = await Zone.findById(profile.zoneId).lean();
    zoneName = zone ? zone.name : null;
  }

  await recordAudit({
    actorUserId: adminId,
    action: "ADMIN_VIEW_RIDER_DETAIL",
    entity: "rider_profiles",
    entityId: riderId,
  });

  return {
    riderId: user._id.toString(),
    email: user.email,
    phone: user.phone,
    profile: profile
      ? {
          referenceNumber: profile.referenceNumber,
          fullName: profile.fullName,
          status: profile.status,
          rideType: profile.rideType,
          deliveryPreference: profile.deliveryPreference,
          zoneId: profile.zoneId,
          zoneName,
          vehicleType: profile.vehicleType,
          vehicleOwnership: profile.vehicleOwnership,
          completedSteps: profile.completedSteps,
          submittedAt: profile.submittedAt,
          reviewedAt: profile.reviewedAt,
          reviewReason: profile.reviewReason,
          stepsToRedo: profile.stepsToRedo,
        }
      : null,
    vehicle: vehicle
      ? {
          ownerName: vehicle.ownerName,
          vehicleNumber: vehicle.vehicleNumber,
          brandModel: vehicle.brandModel,
          fuelType: vehicle.fuelType,
          loadCapacity: vehicle.loadCapacity,
          permitType: vehicle.permitType,
          evCategory: vehicle.evCategory,
          cycleType: vehicle.cycleType,
          dlNumber: vehicle.dlNumber,
          dlBadge: vehicle.dlBadge,
          dlExpiryDate: vehicle.dlExpiryDate,
        }
      : null,
    documents: (documents || []).map((d) => ({
      docType: d.docType,
      verificationStatus: d.verificationStatus,
      file: fileMap.get(d.fileId.toString()) || null,
    })),
    kyc: kyc
      ? {
          idType: kyc.idType,
          status: kyc.status,
          verifiedName: kyc.verifiedName,
          aadhaarLast4: kyc.aadhaarLast4 ? `XXXX XXXX ${kyc.aadhaarLast4}` : null,
          documentFile: kyc.documentFileId ? fileMap.get(kyc.documentFileId.toString()) : null,
          addressText: kyc.addressText,
          verifiedAt: kyc.verifiedAt,
        }
      : null,
    selfie: selfie
      ? {
          status: selfie.status,
          matchScore: selfie.matchScore,
          livenessPassed: selfie.livenessPassed,
          needsManualReview: selfie.needsManualReview,
          file: fileMap.get(selfie.fileId.toString()) || null,
        }
      : null,
    kitAddress,
    nominee,
    bank: bank
      ? {
          bankName: bank.bankName,
          branch: bank.branch,
          ifsc: bank.ifsc,
          accountLast4: `XXXXXX${bank.accountLast4}`,
          accountType: bank.accountType,
          holderName: bank.holderName,
          nameMatch: bank.nameMatch,
          upiId: bank.upiId,
          passbookFile: bank.passbookFileId ? fileMap.get(bank.passbookFileId.toString()) : null,
        }
      : null,
  };
}

async function reviewRider(adminId, riderId, { decision, reason, stepsToRedo = [] }) {
  const profile = await RiderProfile.findOne({ userId: riderId });
  if (!profile) {
    throw new AppError("NOT_FOUND", 404, "Rider profile not found");
  }

  if (profile.status !== "PENDING_REVIEW") {
    throw new AppError(
      "INVALID_STATE",
      409,
      `Rider is in state '${profile.status}', review is allowed only in 'PENDING_REVIEW'`
    );
  }

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      if (decision === "APPROVE") {
        await RiderProfile.findOneAndUpdate(
          { userId: riderId, status: "PENDING_REVIEW" },
          {
            status: "APPROVED",
            reviewedAt: new Date(),
            reviewedBy: adminId,
            reviewReason: reason || null,
          },
          { session }
        );

        await KitOrder.findOneAndUpdate(
          { riderId },
          { status: "PENDING_SHIPMENT" },
          { upsert: true, new: true, session }
        );

        await InsuranceEnrollment.findOneAndUpdate(
          { riderId },
          {
            medicalCoverInr: deliveryEnv.MEDICAL_COVER_INR,
            accidentalCoverInr: deliveryEnv.ACCIDENTAL_COVER_INR,
            status: "PENDING",
          },
          { upsert: true, new: true, session }
        );
      } else if (decision === "REQUEST_CHANGES") {
        await RiderProfile.findOneAndUpdate(
          { userId: riderId, status: "PENDING_REVIEW" },
          {
            status: "CHANGES_REQUESTED",
            reviewedAt: new Date(),
            reviewedBy: adminId,
            reviewReason: reason,
            stepsToRedo: stepsToRedo || [],
            $pull: { completedSteps: { $in: stepsToRedo } },
          },
          { session }
        );
      } else if (decision === "REJECT") {
        await RiderProfile.findOneAndUpdate(
          { userId: riderId, status: "PENDING_REVIEW" },
          {
            status: "REJECTED",
            reviewedAt: new Date(),
            reviewedBy: adminId,
            reviewReason: reason,
          },
          { session }
        );
      }
    });
  } finally {
    await session.endSession();
  }

  // Audit and event stub
  await recordAudit({
    actorUserId: adminId,
    action: "RIDER_REVIEWED",
    entity: "rider_profiles",
    entityId: riderId,
    meta: { decision, reason, stepsToRedo },
  });

  console.log(`[Event: rider.onboarding.reviewed] riderId=${riderId} decision=${decision} adminId=${adminId}`);

  return {
    riderId,
    status: decision === "APPROVE" ? "APPROVED" : decision === "REQUEST_CHANGES" ? "CHANGES_REQUESTED" : "REJECTED",
    reviewedAt: new Date(),
  };
}

module.exports = {
  listRiders,
  getRiderDetail,
  reviewRider,
};
