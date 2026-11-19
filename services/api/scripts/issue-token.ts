import { SignJWT, importPKCS8 } from "jose";
import { readFileSync } from "node:fs";

// Bốn người dùng thử, đại diện cho ba vai trò
const users: Record<string, { sub: string; role: string }> = {
  alice: { sub: "user-alice", role: "customer" },
  bob: { sub: "user-bob", role: "customer" },
  carol: { sub: "user-carol", role: "seller" },
  admin: { sub: "user-admin", role: "admin" },
};

const name = process.argv[2];
const expiresIn = process.argv[3] ?? "15m"; // tham số tùy chọn, dùng để thử token hết hạn
const user = name ? users[name] : undefined;
if (!user) {
  console.error(
    "Dùng: npx tsx scripts/issue-token.ts <alice|bob|carol|admin> [thời hạn]",
  );
  process.exit(1);
}

const privateKey = await importPKCS8(
  readFileSync("keys/private.pem", "utf8"),
  "RS256",
);

const token = await new SignJWT({ role: user.role })
  .setProtectedHeader({ alg: "RS256", typ: "JWT" })
  .setSubject(user.sub) // sub: ai đang gọi
  .setIssuer("securemart-idp") // iss: ai phát token
  .setAudience("securemart-api") // aud: token dành cho API nào
  .setIssuedAt()
  .setExpirationTime(expiresIn) // exp: hết hạn
  .sign(privateKey);

console.log(token);
