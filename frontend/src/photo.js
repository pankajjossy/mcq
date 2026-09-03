// Raw phone-camera photos are routinely 3-12MB. Base64-encoding that
// (roughly +33% size) and sending several of them in one JSON body risks
// hitting the Edge Function's request-size limit and is slow on mobile
// data for no benefit - Gemini's vision grading needs the handwriting to
// be legible, not full camera resolution. This downsamples + re-compresses
// each photo client-side before it's ever turned into base64.
export function photoToBase64(file, { maxDim = 1600, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            // Canvas export failed for some reason - fall back to the
            // original file rather than blocking submission entirely.
            return fileToRawBase64(file).then(resolve).catch(reject);
          }
          const reader = new FileReader();
          reader.onload = () => resolve({ base64: reader.result.split(",")[1], mimeType: "image/jpeg" });
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        },
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      // Not a decodable image in this browser (rare, but happens with some
      // HEIC captures) - fall back to sending the original file untouched.
      fileToRawBase64(file).then(resolve).catch(reject);
    };
    img.src = objectUrl;
  });
}

function fileToRawBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ base64: reader.result.split(",")[1], mimeType: file.type || "image/jpeg" });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
