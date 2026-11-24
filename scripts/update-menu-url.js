const QRCode = require("qrcode");
const path = require("path");
const mongoose = require("mongoose");

async function updateAll() {
  const targetId = "6b040b58a2d430f1fb458ac3";
  const liveUrl = "https://metkart-backend-new.onrender.com/api/user/food/menu/" + targetId;
  const filePath = path.join(process.cwd(), "storage", "restaurant-menu", "qr-" + targetId + ".png");

  await QRCode.toFile(filePath, liveUrl, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 320,
    color: { dark: "#000000", light: "#FFFFFF" }
  });
  console.log("Regenerated local QR code for:", targetId, "to URL:", liveUrl);

  const dbs = ["Metkart", "MetkartNew"];
  for (const db of dbs) {
    const conn = await mongoose.createConnection("mongodb+srv://abhisheks:ijgha3sbMNK0Hfsu@cluster0.ul6vz.mongodb.net/" + db + "?retryWrites=true&w=majority&appName=Cluster0").asPromise();
    const res = await conn.collection("menus").updateMany(
      { restaurantId: new mongoose.Types.ObjectId(targetId) },
      { $set: { menuUrl: liveUrl, qrCode: "/storage/restaurant-menu/qr-" + targetId + ".png" } }
    );
    console.log(db, "updated menus count:", res.modifiedCount);
    await conn.close();
  }
}

updateAll().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
