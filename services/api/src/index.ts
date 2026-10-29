import Fastify from "fastify";

const app = Fastify({
  logger: true,
  ajv: {
    customOptions: {
      // Không tự ép kiểu: "100" (chuỗi) sẽ bị từ chối thay vì biến thành số 100
      coerceTypes: false,
      // Không âm thầm xóa trường thừa: trường lạ sẽ bị từ chối bằng lỗi 400
      removeAdditional: false,
    },
  },
});
app.get("/health", async () => {
  return {
    status: "ok",
    service: "marketplace-api",
    message: "Backend is running",
  };
});

const products = [
  {
    id: 1,
    name: "Keyboard",
    price: 850000,
    stock: 10,
  },
  {
    id: 2,
    name: "Gaming Mouse",
    price: 450000,
    stock: 20,
  },
  {
    id: 3,
    name: "USB-C Hub",
    price: 320000,
    stock: 15,
  },
];

app.get("/products", async () => {
  return {
    data: products,
    total: products.length,
  };
});

app.get<{ Params: { id: string } }>("/products/:id", async (request, reply) => {
  const id = Number(request.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return reply.code(400).send({
      error: "Invalid product ID",
    });
  }

  const product = products.find((item) => item.id === id);

  if (!product) {
    return reply.code(404).send({
      error: "Product not found",
    });
  }

  return {
    data: product,
  };
});

// Kiểu dữ liệu của body mà client gửi lên (TypeScript chỉ kiểm tra lúc biên dịch)
type CreateProductBody = {
  name: string;
  price: number;
  stock: number;
};

app.post<{ Body: CreateProductBody }>(
  "/products",
  {
    // Schema kiểm tra dữ liệu lúc chạy thật. Sai schema thì Fastify tự trả 400,
    // code bên dưới sẽ không được chạy.
    schema: {
      body: {
        type: "object",
        required: ["name", "price", "stock"], // bắt buộc đủ 3 trường
        additionalProperties: false, // không cho phép trường lạ
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            // \S = ký tự không phải khoảng trắng.
            // Yêu cầu có ít nhất 1 ký tự thật, chặn tên chỉ gồm "   "
            pattern: "\\S",
          },
          price: { type: "number", minimum: 0 }, // số, không âm
          stock: { type: "integer", minimum: 0 }, // số nguyên, không âm
        },
      },
    },
  },
  async (request, reply) => {
    const { name, price, stock } = request.body;

    // ID mới = ID lớn nhất hiện có + 1.
    // Không dùng products.length + 1 vì sau này khi xóa sản phẩm sẽ bị trùng ID.
    const newId = Math.max(0, ...products.map((item) => item.id)) + 1;

    const newProduct = {
      id: newId,
      name: name.trim(), // loại khoảng trắng thừa ở hai đầu
      price,
      stock,
    };

    products.push(newProduct);

    // 201 Created: tạo mới thành công (khác 200 OK)
    return reply.code(201).send({ data: newProduct });
  },
);

// Mọi trường đều TÙY CHỌN: client gửi trường nào thì ta sửa trường đó
type UpdateProductBody = Partial<CreateProductBody>;

app.patch<{ Params: { id: string }; Body: UpdateProductBody }>(
  "/products/:id",
  {
    schema: {
      body: {
        type: "object",
        // Không có "required": client được phép gửi một phần
        // minProperties: 1 chặn body rỗng {} (gửi lên mà không sửa gì thì vô nghĩa)
        minProperties: 1,
        // Chặn mọi trường ngoài danh sách. Quan trọng: client không thể
        // gửi {"id": 99} để đổi ID của sản phẩm
        additionalProperties: false,
        properties: {
          name: {
            type: "string",
            minLength: 1,
            maxLength: 100,
            pattern: "\\S",
          },
          price: { type: "number", minimum: 0 },
          stock: { type: "integer", minimum: 0 },
        },
      },
    },
  },
  async (request, reply) => {
    // Kiểm tra ID giống endpoint GET /products/:id
    const id = Number(request.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "Invalid product ID" });
    }

    const product = products.find((item) => item.id === id);

    if (!product) {
      return reply.code(404).send({ error: "Product not found" });
    }

    const { name, price, stock } = request.body;

    // Dùng "!== undefined" chứ KHÔNG dùng "if (price)":
    // nếu viết "if (stock)" thì stock = 0 (hết hàng, hợp lệ) sẽ bị bỏ qua
    // vì số 0 được JavaScript coi là "sai" (falsy).
    if (name !== undefined) product.name = name.trim();
    if (price !== undefined) product.price = price;
    if (stock !== undefined) product.stock = stock;

    return { data: product };
  },
);

app.delete<{ Params: { id: string } }>(
  "/products/:id",
  async (request, reply) => {
    // Kiểm tra ID giống GET và PATCH
    const id = Number(request.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: "Invalid product ID" });
    }

    // findIndex trả về VỊ TRÍ trong mảng (0, 1, 2...), không phải id.
    // Không tìm thấy thì trả -1.
    const index = products.findIndex((item) => item.id === id);

    if (index === -1) {
      return reply.code(404).send({ error: "Product not found" });
    }

    // splice(vị trí, số phần tử) xóa phần tử khỏi mảng tại chỗ
    products.splice(index, 1);

    // 204 No Content: xóa thành công và không có nội dung trả về.
    // Với 204, không được gửi body.
    return reply.code(204).send();
  },
);

const start = async () => {
  try {
    await app.listen({
      port: 3000,
      host: "0.0.0.0",
    });
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
};

start();
