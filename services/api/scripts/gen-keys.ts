import { generateKeyPair, exportPKCS8, exportSPKI } from "jose";
import { mkdirSync, writeFileSync } from "node:fs";

// Sinh cặp khóa RSA 2048 bit cho thuật toán RS256
const { publicKey, privateKey } = await generateKeyPair("RS256", {
  modulusLength: 2048,
  extractable: true, // cần để xuất ra file
});

mkdirSync("keys", { recursive: true });
// Khóa riêng: chỉ chủ sở hữu được đọc (mode 0o600)
writeFileSync("keys/private.pem", await exportPKCS8(privateKey), {
  mode: 0o600,
});
writeFileSync("keys/public.pem", await exportSPKI(publicKey));
console.log("Đã tạo keys/private.pem và keys/public.pem");
