// controllers/import.controller.js
const Import = require("../models/Import");
const Client = require("../models/Client");
const { createStoreFromImport } = require("./store.controller");

/**
 * 📌 Yangi import yaratish
 */
const createImport = async (req, res) => {
  try {
    const {
      client_name,
      phone,
      address = "",
      usd_rate = 0,
      paid_amount = 0,
      products,
      note = "",
    } = req.body;

    // 🔍 Majburiy maydonlarni tekshirish
    if (!client_name || !phone) {
      return res
        .status(400)
        .json({ message: "Mijoz nomi va telefon kiritilishi kerak" });
    }

    if (!Array.isArray(products) || products.length === 0) {
      return res
        .status(400)
        .json({ message: "Kamida bitta mahsulot bo'lishi kerak" });
    }

    // USD kursi tekshiruvi
    if (products.some((p) => p.currency === "USD") && usd_rate <= 0) {
      return res
        .status(400)
        .json({ message: "USD mahsulotlar uchun kurs kiritilishi kerak" });
    }

    // 📌 Mijozni olish yoki yaratish
    let client = await Client.findOne({ phone: phone.trim() });
    if (!client) {
      client = await Client.create({
        name: client_name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        totalDebt: 0,
        paymentHistory: [],
      });
    }

    // 📌 Oxirgi partiya raqamini topish (avtomatik oshirish)
    const lastImport = await Import.findOne().sort({ partiya_number: -1 });
    const nextPartiyaNumber = lastImport
      ? Number(lastImport.partiya_number) + 1
      : 1;

    // 📌 Mahsulotlarni qayta ishlash va validatsiya
    const processedProducts = [];
    let totalImportPriceUZS = 0;

    for (let i = 0; i < products.length; i++) {
      const p = products[i];

      // Mahsulot validatsiyasi
      if (!p.product_name || !p.product_name.trim()) {
        throw new Error(
          `Mahsulot nomi bo'sh bo'lishi mumkin emas (${i + 1}-mahsulot)`
        );
      }
      if (!p.unit || !p.unit.trim()) {
        throw new Error(`O'lchov birligi ko'rsatilmagan (${i + 1}-mahsulot)`);
      }
      if (typeof p.quantity !== "number" || p.quantity <= 0) {
        throw new Error(`Noto'g'ri miqdor (${i + 1}-mahsulot)`);
      }
      if (typeof p.total_price !== "number" || p.total_price <= 0) {
        throw new Error(`Noto'g'ri narx (${i + 1}-mahsulot)`);
      }
      if (!p.currency || !["USD", "UZS"].includes(p.currency)) {
        throw new Error(`Noto'g'ri valyuta (${i + 1}-mahsulot)`);
      }

      // UZS ga o'tkazish
      const priceUZS =
        p.currency === "USD" ? p.total_price * usd_rate : p.total_price;
      totalImportPriceUZS += priceUZS;

      // Bir dona narxini hisoblash
      const unitPrice = p.total_price / p.quantity;

      processedProducts.push({
        title: p.product_name.trim(),
        model: p.model ? p.model.trim() : "",
        unit: p.unit.trim(),
        quantity: Number(p.quantity),
        unit_price: Number(unitPrice.toFixed(2)),
        total_price: Number(p.total_price.toFixed(2)),
        currency: p.currency,
        sell_price:
          typeof p.sell_price === "number" && p.sell_price > 0
            ? Number(p.sell_price.toFixed(2))
            : Number(unitPrice.toFixed(2)), // default qilib kirim narxi
        paid_amount: 0, // keyinroq hisoblanadi
        remaining_debt: 0, // keyinroq hisoblanadi
        price_uzs: Number(priceUZS.toFixed(2)), // UZS dagi narx
      });
    }

    // 📌 To'langan summani mahsulotlar bo'yicha taqsimlash
    processedProducts.forEach((product) => {
      if (totalImportPriceUZS > 0) {
        const productShare = product.price_uzs / totalImportPriceUZS;
        product.paid_amount = Number((productShare * paid_amount).toFixed(2));
        product.remaining_debt = Number(
          (product.price_uzs - product.paid_amount).toFixed(2)
        );
      } else {
        product.paid_amount = 0;
        product.remaining_debt = product.price_uzs;
      }
    });

    // 📌 Import hujjatini yaratish
    const newImport = await Import.create({
      client: client._id,
      usd_to_uzs_rate: Number(usd_rate),
      paid_amount: Number(paid_amount.toFixed(2)),
      partiya_number: nextPartiyaNumber,
      products: processedProducts,
      note: note.trim(),
      total_amount_uzs: Number(totalImportPriceUZS.toFixed(2)),
      remaining_debt: Number((totalImportPriceUZS - paid_amount).toFixed(2)),
      status: paid_amount >= totalImportPriceUZS ? "paid" : "partial",
    });

    // 📌 Mijozning umumiy qarzini yangilash
    const totalRemainingDebt = processedProducts.reduce(
      (sum, p) => sum + p.remaining_debt,
      0
    );

    client.totalDebt = Number(
      ((client.totalDebt || 0) + totalRemainingDebt).toFixed(2)
    );

    // Agar to'lov qilingan bo'lsa, to'lov tarixiga qo'shish
    if (paid_amount > 0) {
      if (!Array.isArray(client.paymentHistory)) {
        client.paymentHistory = [];
      }
      client.paymentHistory.push({
        amount: Number(paid_amount),
        date: new Date(),
        note: `${nextPartiyaNumber}-partiya uchun dastlabki to'lov`,
        import_id: newImport._id,
      });
    }

    await client.save();

    // 📌 Omborga qo'shish
    try {
      await createStoreFromImport(newImport);
    } catch (storeError) {
      console.warn("Omborga qo'shishda ogohlantirish:", storeError.message);
      // Import yaratildi, lekin ombor xatosi bo'lsa ham davom etamiz
    }

    // Populate qilib qaytarish
    const populatedImport = await Import.findById(newImport._id).populate(
      "client",
      "name phone address totalDebt"
    );

    res.status(201).json({
      success: true,
      message: "Import muvaffaqiyatli yaratildi",
      data: populatedImport,
      summary: {
        partiya_number: nextPartiyaNumber,
        total_products: processedProducts.length,
        total_amount_uzs: totalImportPriceUZS,
        paid_amount: paid_amount,
        remaining_debt: totalImportPriceUZS - paid_amount,
        client_total_debt: client.totalDebt,
      },
    });
  } catch (error) {
    console.error("Import yaratishda xatolik:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Yuk kirim qilishda xatolik",
    });
  }
};

/**
 * 📌 ID bo'yicha import olish
 */
const getImportById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Noto'g'ri ID formati" });
    }

    const foundImport = await Import.findById(id).populate(
      "client",
      "name phone address totalDebt"
    );

    if (!foundImport) {
      return res.status(404).json({ message: "Import topilmadi" });
    }

    res.status(200).json({
      success: true,
      data: foundImport,
    });
  } catch (error) {
    console.error("Importni olishda xatolik:", error);
    res.status(500).json({
      success: false,
      message: "Importni olishda xatolik",
      error: error.message,
    });
  }
};

/**
 * 📌 Barcha importlarni olish
 */
const getAllImports = async (req, res) => {
  try {
    const { client_id, status, page = 1, limit = 50 } = req.query;

    // Filter yaratish
    const filter = {};
    if (client_id && client_id.match(/^[0-9a-fA-F]{24}$/)) {
      filter.client = client_id;
    }
    if (status && ["paid", "partial", "unpaid"].includes(status)) {
      filter.status = status;
    }

    // Pagination
    const skip = (page - 1) * limit;

    const imports = await Import.find(filter)
      .populate("client", "name phone address totalDebt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Import.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: imports,
      pagination: {
        current_page: parseInt(page),
        per_page: parseInt(limit),
        total: total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Importlarni olishda xatolik:", error);
    res.status(500).json({
      success: false,
      message: "Importlarni olishda xatolik",
      error: error.message,
    });
  }
};

/**
 * 📌 Mijoz bo'yicha guruhlangan importlar
 */
const getImportsGroupedByClient = async (req, res) => {
  try {
    const imports = await Import.find()
      .populate("client", "name phone address totalDebt")
      .sort({ createdAt: -1 });

    // 📊 Mijozlar bo'yicha guruhlash
    const grouped = imports.reduce((acc, imp) => {
      const clientId = imp.client._id.toString();

      if (!acc[clientId]) {
        acc[clientId] = {
          client: {
            _id: imp.client._id,
            name: imp.client.name,
            phone: imp.client.phone,
            address: imp.client.address,
            totalDebt: imp.client.totalDebt,
          },
          imports: [],
          summary: {
            total_imports: 0,
            total_amount_uzs: 0,
            total_paid: 0,
            total_debt: 0,
            total_products: 0,
          },
        };
      }

      // Import ma'lumotlarini qo'shish
      const importDebt = imp.products.reduce(
        (sum, p) => sum + p.remaining_debt,
        0
      );
      const importPaid = imp.products.reduce(
        (sum, p) => sum + p.paid_amount,
        0
      );
      const importTotal = imp.total_amount_uzs || 0;

      acc[clientId].imports.push({
        _id: imp._id,
        partiya_number: imp.partiya_number,
        products_count: imp.products.length,
        total_amount_uzs: importTotal,
        paid_amount: imp.paid_amount,
        remaining_debt: importDebt,
        status: imp.status,
        createdAt: imp.createdAt,
      });

      // Umumiy ma'lumotlarni yangilash
      acc[clientId].summary.total_imports += 1;
      acc[clientId].summary.total_amount_uzs += importTotal;
      acc[clientId].summary.total_paid += importPaid;
      acc[clientId].summary.total_debt += importDebt;
      acc[clientId].summary.total_products += imp.products.length;

      return acc;
    }, {});

    res.status(200).json({
      success: true,
      data: Object.values(grouped),
      total_clients: Object.keys(grouped).length,
    });
  } catch (error) {
    console.error("Guruhlangan importlarni olishda xatolik:", error);
    res.status(500).json({
      success: false,
      message: "Guruhlangan importlarni olishda xatolik",
      error: error.message,
    });
  }
};

/**
 * 📌 Oxirgi partiya raqamini olish
 */
const getLastPartiyaNumber = async (req, res) => {
  try {
    const lastImport = await Import.findOne()
      .sort({ partiya_number: -1 })
      .select("partiya_number");

    res.status(200).json({
      success: true,
      lastPartiya: lastImport ? lastImport.partiya_number : 0,
      nextPartiya: lastImport ? lastImport.partiya_number + 1 : 1,
    });
  } catch (error) {
    console.error("Oxirgi partiya raqamini olishda xatolik:", error);
    res.status(500).json({
      success: false,
      message: "Oxirgi partiya raqamini olishda xatolik",
      error: error.message,
    });
  }
};

/**
 * 📌 Import yangilash (masalan, to'lov qo'shish)
 */
const updateImportPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const { additional_payment } = req.body;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Noto'g'ri ID formati" });
    }

    if (!additional_payment || additional_payment <= 0) {
      return res.status(400).json({ message: "To'lov summasi noto'g'ri" });
    }

    const importDoc = await Import.findById(id).populate("client");
    if (!importDoc) {
      return res.status(404).json({ message: "Import topilmadi" });
    }

    const remainingDebt = importDoc.total_amount_uzs - importDoc.paid_amount;
    if (additional_payment > remainingDebt) {
      return res.status(400).json({
        message: `To'lov summasi qarzdan ko'p. Qarz: ${remainingDebt.toLocaleString()} so'm`,
      });
    }

    // Import to'lovini yangilash
    importDoc.paid_amount += additional_payment;
    const newRemainingDebt = importDoc.total_amount_uzs - importDoc.paid_amount;
    importDoc.remaining_debt = newRemainingDebt;
    importDoc.status = newRemainingDebt <= 0 ? "paid" : "partial";

    // Mahsulotlar bo'yicha taqsimlash
    importDoc.products.forEach((product) => {
      const productShare = product.price_uzs / importDoc.total_amount_uzs;
      const productPayment = productShare * additional_payment;
      product.paid_amount += productPayment;
      product.remaining_debt = Math.max(
        product.price_uzs - product.paid_amount,
        0
      );
    });

    await importDoc.save();

    // Mijoz qarzini yangilash
    const client = importDoc.client;
    client.totalDebt = Math.max(client.totalDebt - additional_payment, 0);

    // To'lov tarixiga qo'shish
    if (!Array.isArray(client.paymentHistory)) {
      client.paymentHistory = [];
    }
    client.paymentHistory.push({
      amount: additional_payment,
      date: new Date(),
      note: `${importDoc.partiya_number}-partiya uchun qo'shimcha to'lov`,
      import_id: importDoc._id,
    });

    await client.save();

    res.status(200).json({
      success: true,
      message: "To'lov muvaffaqiyatli qabul qilindi",
      data: importDoc,
    });
  } catch (error) {
    console.error("Import to'lovini yangilashda xatolik:", error);
    res.status(500).json({
      success: false,
      message: "To'lovni yangilashda xatolik",
      error: error.message,
    });
  }
};

/**
 * 📌 Import o'chirish
 */
const deleteImport = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({ message: "Noto'g'ri ID formati" });
    }

    const importDoc = await Import.findById(id).populate("client");
    if (!importDoc) {
      return res.status(404).json({ message: "Import topilmadi" });
    }

    // Mijoz qarzini qayta hisoblash
    const client = importDoc.client;
    const importDebt = importDoc.remaining_debt || 0;
    client.totalDebt = Math.max(client.totalDebt - importDebt, 0);
    await client.save();

    // Importni o'chirish
    await Import.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Import muvaffaqiyatli o'chirildi",
    });
  } catch (error) {
    console.error("Importni o'chirishda xatolik:", error);
    res.status(500).json({
      success: false,
      message: "Importni o'chirishda xatolik",
      error: error.message,
    });
  }
};

module.exports = {
  createImport,
  getImportById,
  getAllImports,
  getImportsGroupedByClient,
  getLastPartiyaNumber,
  updateImportPayment,
  deleteImport,
};
