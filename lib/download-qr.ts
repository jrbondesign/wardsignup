/**
 * Generate a high-res PNG QR code for an event signup URL and trigger a browser
 * download. qrcode is dynamically imported so it isn't bundled into the
 * dashboard/admin initial chunk.
 */
export async function downloadEventQr(eventId: string, eventName: string) {
  const QRCode = (await import("qrcode")).default;
  const url = `${window.location.origin}/event/${eventId}`;
  const dataUrl = await QRCode.toDataURL(url, {
    errorCorrectionLevel: "H",
    margin: 2,
    width: 1024,
    color: { dark: "#0D2B35", light: "#FFFFFF" },
  });
  const slug =
    eventName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "event";
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `qr-${slug}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
