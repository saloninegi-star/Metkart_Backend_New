const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const fs = require("node:fs/promises");
const path = require("node:path");
const request = require("supertest");
const upload = require("../src/middleware/upload.middleware");
const { errorHandler } = require("../src/middleware/error-handler");

test("icon uploads accept files up to 10 MB and return a clear error above the limit", async () => {
  const app = express();
  app.post("/upload", upload.single("icon"), (req, res) => {
    res.status(200).json({ size: req.file.size, path: req.file.path });
  });
  app.use(errorHandler);

  const uploadedFiles = [];
  try {
    const accepted = await request(app)
      .post("/upload")
      .attach("icon", Buffer.alloc(3 * 1024 * 1024), {
        filename: "icon.png",
        contentType: "image/png",
      });

    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.size, 3 * 1024 * 1024);
    uploadedFiles.push(path.resolve(accepted.body.path));

    const rejected = await request(app)
      .post("/upload")
      .attach("icon", Buffer.alloc(10 * 1024 * 1024 + 1), {
        filename: "large-icon.png",
        contentType: "image/png",
      });  
   
    assert.equal(rejected.status, 413);
    assert.equal(rejected.body.success, false);
    assert.equal(rejected.body.error.message, "Uploaded file exceeds the 10 MB limit");
  } finally {
    await Promise.all(
      uploadedFiles.map((filePath) => fs.unlink(filePath).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      }))
    );
  }
});
