// Walk JPEG markers, including progressive scans. Bytes after the end-of-image
// marker are permitted (some cameras append metadata). This is structural
// validation, not a malware scanner; downloads remain attachments with nosniff.
export function validJpeg(data) {
  if (data.length < 10 || data[0] !== 255 || data[1] !== 216) return false;
  let at = 2, frame = false, scan = false;
  while (at < data.length) {
    if (data[at++] !== 255) return false;
    while (data[at] === 255) at++;
    const marker = data[at++];
    if (marker === 217) return frame && scan;
    if (marker === undefined || marker === 0 || marker === 216) return false;
    if (marker === 1 || (marker >= 208 && marker <= 215)) continue;
    if (at + 2 > data.length) return false;
    const size = data[at] * 256 + data[at + 1];
    if (size < 2 || at + size > data.length) return false;
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
      if (size < 8 || !(data[at + 3] * 256 + data[at + 4]) || !(data[at + 5] * 256 + data[at + 6])) return false;
      frame = true;
    }
    at += size;
    if (marker === 218) {
      if (!frame) return false;
      scan = true;
      while (at < data.length) {
        if (data[at] !== 255) { at++; continue; }
        let next = at + 1;
        while (data[next] === 255) next++;
        if (data[next] === 0 || (data[next] >= 208 && data[next] <= 215)) { at = next + 1; continue; }
        break;
      }
    }
  }
  return false;
}
