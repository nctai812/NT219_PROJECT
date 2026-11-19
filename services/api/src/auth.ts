import type { FastifyReply, FastifyRequest } from "fastify";
import { importSPKI, jwtVerify } from "jose";
import { readFileSync } from "node:fs";

const ISSUER = "securemart-idp";
const AUDIENCE = "securemart-api";

export type Role = "customer" | "seller" | "admin";
export interface AuthUser {
  sub: string;
  role: Role;
}

// Gắn thêm trường `user` vào request để các handler phía sau dùng
declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

// API chỉ cần KHÓA CÔNG KHAI để kiểm tra chữ ký
const publicKey = await importSPKI(
  readFileSync(process.env.JWT_PUBLIC_KEY_PATH ?? "keys/public.pem", "utf8"),
  "RS256",
);

// Bước 1: xác thực (ai đang gọi?). Sai bất kỳ điểm nào là 401.
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return reply.code(401).send({ error: "Missing bearer token" });
  }

  try {
    const { payload } = await jwtVerify(
      header.slice("Bearer ".length),
      publicKey,
      {
        algorithms: ["RS256"], // chỉ nhận RS256, chặn trò đổi thuật toán
        issuer: ISSUER, // kiểm tra iss
        audience: AUDIENCE, // kiểm tra aud; exp được kiểm tra tự động
      },
    );

    const role = payload.role;
    if (
      typeof payload.sub !== "string" ||
      (role !== "customer" && role !== "seller" && role !== "admin")
    ) {
      return reply.code(401).send({ error: "Invalid token" });
    }
    request.user = { sub: payload.sub, role };
  } catch {
    // Không tiết lộ lý do cụ thể (sai chữ ký, hết hạn...) cho client
    return reply.code(401).send({ error: "Invalid token" });
  }
}

// Bước 2: phân quyền (được làm gì?). Không đủ quyền là 403.
export function requireRole(...allowed: Role[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !allowed.includes(request.user.role)) {
      return reply.code(403).send({ error: "Forbidden" });
    }
  };
}
