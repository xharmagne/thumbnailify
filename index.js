"use strict";

const gm = require("gm").subClass({ imageMagick: true });
const fs = require("fs").promises;
const path = require("path");
const { Storage } = require("@google-cloud/storage");
const storage = new Storage();

const { THUMBNAIL_BUCKET_NAME } = process.env;
const THUMBNAIL_WIDTH = 200;

exports.createThumbnail = async (event) => {
	// This event represents the triggering Cloud Storage object.
	const object = event;

	const file = storage.bucket(object.bucket).file(object.name);
	console.log(`Processing ${file.name}.`);

	return await resizeImage(file, THUMBNAIL_BUCKET_NAME, THUMBNAIL_WIDTH);
};

const resizeImage = async (file, thumbnailBucketName, thumbnailWidth) => {
	const tempLocalPath = `/tmp/${path.parse(file.name).base}`;

	// Download file from bucket.
	try {
		await file.download({ destination: tempLocalPath });

		console.log(`Downloaded ${file.name} to ${tempLocalPath}.`);
	} catch (err) {
		throw new Error(`File download failed: ${err}`);
	}

	await new Promise((resolve, reject) => {
		gm(tempLocalPath)
			.resize(thumbnailWidth)
			.write(tempLocalPath, (err, stdout) => {
				if (err) {
					console.error("Failed to resize image.", err);
					reject(err);
				} else {
					console.log(`Resized image: ${file.name}`);
					resolve(stdout);
				}
			});
	});

	// Upload result to a different bucket, to avoid re-triggering this function.
	const thumbnailBucket = storage.bucket(thumbnailBucketName);

	// Upload the image into the bucket.
	const gcsPath = `gs://${thumbnailBucketName}/${file.name}`;
	try {
		await thumbnailBucket.upload(tempLocalPath, { destination: file.name });
		console.log(`Uploaded thumbnail image to: ${gcsPath}`);
	} catch (err) {
		throw new Error(
			`Unable to upload thumbnail image to ${gcsPath}: ${err}`
		);
	}

	// Delete the temporary file.
	return fs.unlink(tempLocalPath);
};
