function cameraErrorMessage(error) {
  if (!globalThis.isSecureContext && !["localhost", "127.0.0.1"].includes(globalThis.location?.hostname)) {
    return "Камер ашиглахын тулд UniNet-ийг HTTPS холболтоор нээнэ үү.";
  }
  if (error?.name === "NotAllowedError" || error?.name === "SecurityError") {
    return "Camera permission хаалттай байна. Browser-ийн site settings-ээс камерыг зөвшөөрөөд дахин оролдоно уу.";
  }
  if (error?.name === "NotFoundError" || error?.name === "DevicesNotFoundError") {
    return "Камер олдсонгүй. Камер холбоод дахин оролдох эсвэл token/USB scanner ашиглана уу.";
  }
  if (error?.name === "NotReadableError" || error?.name === "TrackStartError") {
    return "Камерыг өөр програм ашиглаж байна. Тэр програмыг хаагаад дахин оролдоно уу.";
  }
  return error?.message || "Камер нээж чадсангүй. Camera permission-ээ шалгаад дахин оролдоно уу.";
}

/**
 * Starts a standards-based camera QR scanner. ZXing decodes video frames in
 * browsers which expose getUserMedia but do not implement BarcodeDetector
 * (notably Firefox, Safari, and some managed Chrome/Edge installations).
 */
export async function startQrCameraScanner(videoElement, onDetected) {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(cameraErrorMessage({ message: "Энэ browser camera access дэмжихгүй байна. Token/USB scanner ашиглана уу." }));
  }
  if (!videoElement) throw new Error("Camera preview бэлэн болоогүй байна. Дахин оролдоно уу.");

  try {
    const { BrowserQRCodeReader } = await import("@zxing/browser");
    const reader = new BrowserQRCodeReader(undefined, {
      delayBetweenScanAttempts: 180,
      delayBetweenScanSuccess: 800,
    });
    let consumed = false;
    const controls = await reader.decodeFromConstraints({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    }, videoElement, result => {
      const value = result?.getText?.()?.trim();
      if (!value || consumed) return;
      consumed = true;
      onDetected(value);
    });
    return {
      stop() {
        consumed = true;
        controls.stop();
        videoElement.srcObject = null;
      },
    };
  } catch (error) {
    const scannerError = new Error(cameraErrorMessage(error));
    scannerError.cause = error;
    throw scannerError;
  }
}
