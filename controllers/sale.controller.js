const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const Store = require("../models/Store");
const Client = require("../models/Client");
const { io } = require("../index");
const Agent = require("../models/Agent");

const FINAL_STATUSES = ["completed", "approved"];
const toNum = (value) => Number(value) || 0;

async function reserveStoreQuantityForSaleItem(item, session) {
  const requestedQty = toNum(item.quantity);
  if (requestedQty <= 0) {
    return {
      success: false,
      message: `${item?.name || "Mahsulot"} miqdori noto'g'ri`,
    };
  }

  const exactProductId =
    item?.product_id?._id || item?.product_id || item?.id || null;

  const normalizedName = (item?.name || "").trim();
  const normalizedModel = (item?.model || "").trim();
  const normalizedUnit = item?.unit || null;

  const orFilters = [];
  if (exactProductId) {
    orFilters.push({ _id: exactProductId });
  }
  if (normalizedName) {
    const fallbackFilter = { product_name: normalizedName };
    if (normalizedModel) fallbackFilter.model = normalizedModel;
    if (normalizedUnit) fallbackFilter.unit = normalizedUnit;
    orFilters.push(fallbackFilter);
  }

  if (orFilters.length === 0) {
    return {
      success: false,
      message: `${item?.name || "Mahsulot"} uchun ombor yozuvi topilmadi`,
    };
  }

  const storeItems = await Store.find({
    quantity: { $gt: 0 },
    $or: orFilters,
  })
    .sort({
      _id: exactProductId ? -1 : 1,
      createdAt: 1,
    })
    .session(session);

  const totalAvailable = storeItems.reduce(
    (sum, storeItem) => sum + toNum(storeItem.quantity),
    0
  );

  if (totalAvailable < requestedQty) {
    return {
      success: false,
      message: `Omborda ${item?.name || "mahsulot"} yetarli emas`,
    };
  }

  let remainingQty = requestedQty;
  for (const storeItem of storeItems) {
    if (remainingQty <= 0) break;

    const availableQty = toNum(storeItem.quantity);
    if (availableQty <= 0) continue;

    const deductedQty = Math.min(availableQty, remainingQty);
    storeItem.quantity = availableQty - deductedQty;
    await storeItem.save({ session });
    remainingQty -= deductedQty;
  }

  return { success: true };
}

exports.createSale = async (req, res) => {
  try {
    let { customer, products, paid_amount, payment_method, shop_info } =
      req.body;
    paid_amount = Number(paid_amount) || 0;
    const agentId = req.user?.agentId || req.user?._id || null;
    const isAgent = req.user?.role === "agent";
    let agentData = null;
    if (agentId && isAgent) {
      agentData = await Agent.findById(agentId).select("name phone location");
      if (!agentData) {
        return res
          .status(403)
          .json({ message: "Agent ma'lumotlari topilmadi" });
      }
    }

    // 1) Mijozni topish yoki yaratish
    if (!customer || !customer.phone) {
      return res.status(400).json({ message: "customer.phone majburiy" });
    }

    let customerData = await Customer.findOne({ phone: customer.phone });
    if (!customerData) {
      if (!customer.name) {
        return res
          .status(400)
          .json({ message: "Mijoz nomi kiritilishi shart" });
      }
      customerData = await Customer.create({
        name: customer.name,
        phone: customer.phone || "",
        address: customer.address || "",
      });
    }

    // 2) Mahsulotlarni tekshirish va hisoblash
    if (!Array.isArray(products) || products.length === 0) {
      return res.status(400).json({ message: "Mahsulotlar bo'sh bo'lmasin" });
    }

    let total_amount = 0;
    const saleProducts = [];

    for (const p of products) {
      const product = await Store.findById(p.product_id);
      if (!product || product.quantity < p.quantity) {
        return res.status(400).json({
          message: `${
            product?.product_name || "Mahsulot"
          } omborda yetarli emas`,
        });
      }

      const sellPrice = Number(p.price) || Number(product.sell_price) || 0;
      const qty = Number(p.quantity) || 0;
     const purchase_price = Number(product.purchase_price) || 0;

      // Har qanday sotuvda (admin/agent) darhol ombordan kamayadi.
      product.quantity -= qty;
      await product.save();

      saleProducts.push({
        product_id: product._id,
        name: product.product_name,
        model: product.model || "",
        unit: product.unit,
        price: sellPrice,
        purchase_price,
        quantity: qty,
        currency: product.currency,
        partiya_number: product.partiya_number,
      });

      total_amount += sellPrice * qty;
    }

    // 3) Qarzni hisoblash va to'lov turi
    let remaining_debt = Math.max(total_amount - paid_amount, 0);
    if (!payment_method) {
      payment_method = remaining_debt > 0 ? "qarz" : "cash";
    } else if (!["cash", "card", "qarz", "mixed"].includes(payment_method)) {
      payment_method = remaining_debt > 0 ? "qarz" : "cash";
    }
    if (paid_amount > 0 && remaining_debt > 0) payment_method = "mixed";

    // 4) Faktura raqami
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const dayStart = new Date(yyyy, now.getMonth(), now.getDate());
    const dayEnd = new Date(yyyy, now.getMonth(), now.getDate() + 1);

    const todayCount = await Sale.countDocuments({
      createdAt: { $gte: dayStart, $lt: dayEnd },
    });

    const invoice_number = `INV-${yyyy}${mm}${dd}-${String(
      todayCount + 1
    ).padStart(3, "0")}`;

    // 5) Sotuvni yaratish
    const saleData = {
      invoice_number,
      customer_id: customerData._id,
      products: saleProducts,
      total_amount,
      paid_amount,
      remaining_debt,
      payment_method,
      payment_history:
        paid_amount > 0 ? [{ amount: paid_amount, date: new Date() }] : [],
      shop_info: shop_info || {
        name: "MAZZALI",
        address: "Toshkent sh.",
        phone: "+998 94 732 44 44",
      },
      status: "completed",
    };

    // Agent ma'lumotlarini qo'shish
    if (agentData) {
      saleData.agent_id = agentData._id;
      saleData.sale_type = "agent";
      saleData.agent_info = {
        name: agentData.name,
        phone: agentData.phone,
        location: agentData.location || "Noma'lum",
      };
    } else {
      saleData.sale_type = "admin";
    }

    const sale = await Sale.create(saleData);

    // 6) Mijoz balansini faqat yakunlangan sotuvlarda yangilaymiz
    if (!isAgent) {
      if (typeof customerData.updateBalance === "function") {
        await customerData.updateBalance(total_amount, paid_amount);
      } else {
        customerData.totalPurchased += total_amount;
        customerData.totalPaid += paid_amount;
        customerData.totalDebt = Math.max(
          customerData.totalPurchased - customerData.totalPaid,
          0
        );
        await customerData.save();
      }
    }

    // 7) Populate qilib, to'liq ma'lumot olish
    const populatedSale = await Sale.findById(sale._id)
      .populate("customer_id", "name phone address")
      .populate("agent_id", "name phone location");

    // 8) 📢 SOCKET orqali adminlarga REAL-TIME signal yuborish
    const io = req.app.get("io");
    if (io) {
      const socketData = {
        type: isAgent ? "agent_sale" : "admin_sale",
        sale: populatedSale,
        customer: customerData,
        agent: agentData,
        products: saleProducts,
        timestamp: new Date(),
        message: isAgent
          ? `${agentData.name} tomonidan yangi sotuv amalga oshirildi`
          : "Yangi admin sotuv amalga oshirildi",
      };

      // Adminlarga yuborish
      io.to("admins").emit("new_sale_notification", socketData);

      // Barcha foydalanuvchilarga (umumiy)
      io.emit("sale_created", {
        sale_id: sale._id,
        invoice_number: sale.invoice_number,
        total_amount: sale.total_amount,
        sale_type: sale.sale_type,
        agent_name: agentData?.name || "Admin",
      });

    } else {
      console.warn(
        "⚠️ Socket.io topilmadi, real-time bildirishnoma yuborilmadi"
      );
    }



    return res.json({
      success: true,
      sale: populatedSale,
      customer: customerData,
      message: "Sotuv muvaffaqiyatli amalga oshirildi",
    });
  } catch (err) {
    console.error("❌ createSale error:", err);

    // Xatolik bo'lganda omborga qaytarish (admin/agent ikkalasi uchun ham)
    if (req.body.products && Array.isArray(req.body.products)) {
      try {
        for (const p of req.body.products) {
          const product = await Store.findById(p.product_id);
          if (product) {
            product.quantity += Number(p.quantity) || 0;
            await product.save();
          }
        }
        console.log("🔄 Omborga qaytarildi (rollback)");
      } catch (rollbackErr) {
        console.error("❌ Rollback xatoligi:", rollbackErr);
      }
    }

    return res.status(500).json({
      success: false,
      message: err.message,
      error: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
  }
};






// 📄 Barcha sotuvlar (agent bo‘yicha filtrlash mumkin)
exports.getAllSales = async (req, res) => {
  try {
    const filter = {};
    const { agentId, from, to, saleType, page, limit } = req.query;

    // Agent ID bo'yicha filtr
    if (agentId) filter.agent_id = agentId;
    if (saleType === "agent" || saleType === "admin") {
      filter.sale_type = saleType;
    }

    // Sana bo'yicha filtr
    if (from && to && !isNaN(new Date(from)) && !isNaN(new Date(to))) {
      const startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    const usePagination = Number.isInteger(parsedPage) && Number.isInteger(parsedLimit) && parsedPage > 0 && parsedLimit > 0;
    const currentPage = usePagination ? parsedPage : 1;
    const pageSize = usePagination ? Math.min(parsedLimit, 100) : 0;
    const skip = usePagination ? (currentPage - 1) * pageSize : 0;

    let salesQuery = Sale.find(filter)
      .populate("customer_id", "name phone address totalDebt totalPaid")
      .sort({ createdAt: -1 })
      .lean();

    if (usePagination) {
      salesQuery = salesQuery.skip(skip).limit(pageSize);
    }

    const [sales, totalCount] = await Promise.all([
      salesQuery,
      usePagination ? Sale.countDocuments(filter) : Promise.resolve(0),
    ]);

    // Har bir mijoz bo'yicha eng so'nggi to'lov izohini topamiz
    const latestNoteByCustomer = new Map();
    for (const sale of sales) {
      const customerId = sale?.customer_id?._id
        ? String(sale.customer_id._id)
        : sale?.customer_id
          ? String(sale.customer_id)
          : null;
      if (!customerId) continue;

      const history = Array.isArray(sale.payment_history)
        ? sale.payment_history
        : [];
      for (const h of history) {
        const note =
          h?.payment_note ||
          h?.note ||
          h?.izoh ||
          h?.comment ||
          h?.description ||
          "";
        if (!note) continue;
        const at = new Date(h?.date || sale.updatedAt || sale.createdAt || 0);
        const prev = latestNoteByCustomer.get(customerId);
        if (!prev || at > prev.date) {
          latestNoteByCustomer.set(customerId, { note, date: at });
        }
      }
    }

    // Agent ma'lumotlarini qo'lda qo'shish (agar agent_info da saqlangan bo'lsa)
    const salesWithAgentInfo = sales.map((sale) => {
      const saleObj = { ...sale };

      // Agent ma'lumotini turli joylardan olish
      if (saleObj.agent_info) {
        // Agar agent_info da saqlangan bo'lsa
        saleObj.agent_id = {
          _id: saleObj.agent_id || "unknown",
          name: saleObj.agent_info.name || "Noma'lum Agent",
          phone: saleObj.agent_info.phone || "",
          location: saleObj.agent_info.location || "",
        };
      } else if (saleObj.agent_id && !saleObj.agent_id.name) {
        // Agar faqat agent_id ObjectId bo'lsa, default ma'lumot
        saleObj.agent_id = {
          _id: saleObj.agent_id,
          name: "Agent",
          phone: "",
          location: "",
        };
      }

      const ownLatestHistory = Array.isArray(saleObj.payment_history)
        ? saleObj.payment_history.reduce((latest, curr) => {
            if (!latest) return curr;
            return new Date(curr?.date || 0) > new Date(latest?.date || 0)
              ? curr
              : latest;
          }, null)
        : null;

      saleObj.latest_payment_note =
        ownLatestHistory?.payment_note ||
        ownLatestHistory?.note ||
        ownLatestHistory?.izoh ||
        ownLatestHistory?.comment ||
        ownLatestHistory?.description ||
        saleObj.notes ||
        "";

      const customerId = saleObj?.customer_id?._id
        ? String(saleObj.customer_id._id)
        : saleObj?.customer_id
          ? String(saleObj.customer_id)
          : null;
      saleObj.customer_latest_payment_note = customerId
        ? latestNoteByCustomer.get(customerId)?.note || ""
        : "";

      // Frontdan har doim bir xil field o'qish uchun
      saleObj.note =
        saleObj.latest_payment_note ||
        saleObj.customer_latest_payment_note ||
        saleObj.notes ||
        "Qarz to'lovi";

      return saleObj;
    });

    const response = {
      success: true,
      sales: salesWithAgentInfo,
      count: salesWithAgentInfo.length,
      totalCount: usePagination ? totalCount : salesWithAgentInfo.length,
      agentCount: salesWithAgentInfo.filter(
        (s) => s.sale_type === "agent" || s.agent_id
      ).length,
    };

    if (usePagination) {
      response.pagination = {
        page: currentPage,
        limit: pageSize,
        total: totalCount,
        totalPages: Math.max(Math.ceil(totalCount / pageSize), 1),
      };
    }

    return res.json(response);
  } catch (err) {
    console.error("❌ getAllSales error:", err);
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// 👤 AGENT: faqat o‘z sotuvlari
exports.getMySales = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "agent" || !req.user.agentId) {
      return res.status(403).json({ message: "Faqat agentlar uchun ruxsat" });
    }

    const { from, to } = req.query;
    const filter = { agent_id: req.user.agentId };

    if (from && to && !isNaN(new Date(from)) && !isNaN(new Date(to))) {
      const startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const sales = await Sale.find(filter)
      .populate("customer_id")
      .sort({ createdAt: -1 });

    return res.json({ success: true, sales });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// 🔍 Bitta sotuvni olish
exports.getSaleById = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("customer_id")
      .populate("agent_id", "name phone");
    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });
    return res.json({ success: true, sale });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};


exports.getInvoiceData = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("customer_id")
      .populate("products.product_id")
      .populate("agent_id", "name phone location");

    if (!sale) {
      return res.status(404).json({ message: "Faktura topilmadi" });
    }

    const customer = await Customer.findById(sale.customer_id._id);

    const allCustomerSales = await Sale.find({
      customer_id: customer._id,
      _id: { $ne: sale._id },
      status: { $in: FINAL_STATUSES },
      createdAt: { $lt: sale.createdAt },
    });

    // ✅ TO'LIQ LOG
    console.log("\n========== INVOICE DEBUG START ==========");
    console.log("📄 Joriy sotuv ID:", String(sale._id));
    console.log("📄 Joriy sotuv invoice_number:", sale.invoice_number);
    console.log("📄 Joriy total_amount:", sale.total_amount);
    console.log("📄 Joriy paid_amount:", sale.paid_amount);
    console.log("📄 Joriy remaining_debt:", sale.remaining_debt);
    console.log("📄 Joriy payment_method:", sale.payment_method);
    console.log("👤 Mijoz ID:", String(customer._id));
    console.log("👤 Mijoz nomi:", customer.name);
    console.log("👤 Mijoz totalDebt:", customer.totalDebt);
    console.log("👤 Mijoz totalPaid:", customer.totalPaid);
    console.log("👤 Mijoz totalPurchased:", customer.totalPurchased);
    console.log("📦 Boshqa sotuvlar soni:", allCustomerSales.length);
    allCustomerSales.forEach((s, i) => {
      console.log(`  [${i + 1}] ID: ${String(s._id)}`);
      console.log(`       invoice: ${s.invoice_number}`);
      console.log(`       total_amount: ${s.total_amount}`);
      console.log(`       paid_amount: ${s.paid_amount}`);
      console.log(`       remaining_debt: ${s.remaining_debt}`);
      console.log(`       payment_method: ${s.payment_method}`);
    });

    const previousDebt = allCustomerSales.reduce((sum, s) => {
      return sum + Math.max(s.remaining_debt || 0, 0);
    }, 0);

    const totalDebt = previousDebt + (sale.remaining_debt || 0);

    console.log("💰 Hisoblangan previousDebt:", previousDebt);
    console.log("💰 Hisoblangan totalDebt:", totalDebt);
    console.log("========== INVOICE DEBUG END ==========\n");
    // ✅ LOG TUGADI

    const agentData = sale.agent_id || sale.agent_info;
    const isAgentSale = !!(agentData || sale.sale_type === "agent");

    const invoiceData = {
      invoice_number:
        sale.invoice_number || `INV-${String(sale._id).slice(-8)}`,
      date: sale.createdAt,

      shop: sale.shop_info || {
        name: "MAZZALI",
        address: "Toshkent sh.",
        phone: "+998 94 732 44 44",
      },

      customer: {
        name: customer?.name,
        phone: customer?.phone,
        address: customer?.address,
      },

      products: (sale.products || []).map((p) => ({
        name: p.name,
        model: p.model,
        unit: p.unit,
        quantity: p.quantity,
        price: p.price,
        total: p.price * p.quantity,
        currency: p.currency,
        partiya_number: p.partiya_number,
      })),

      payment: {
        total_amount: sale.total_amount,
        paid_amount: sale.paid_amount,
        remaining_debt: sale.remaining_debt,
        previous_debt: previousDebt,
        total_debt: totalDebt,
        payment_method: sale.payment_method,
        payment_status: sale.remaining_debt > 0 ? "qarz" : "to'liq to'langan",
      },

      ...(isAgentSale && {
        agent_id: agentData,
        agent_info: sale.agent_info,
        agent_name: agentData?.name || sale.agent_info?.name,
        agent_phone: agentData?.phone || sale.agent_info?.phone,
        agent_location: agentData?.location || sale.agent_info?.location,
        sale_type: sale.sale_type,
        isAgentSale: true,
        seller: "Agent",
      }),

      ...(!isAgentSale && {
        seller: "Admin",
        isAgentSale: false,
      }),

      check_number: sale.check_number || String(sale._id).slice(-6),
    };

    return res.json({ success: true, invoice: invoiceData });
  } catch (err) {
    console.error("❌ getInvoiceData error:", err);
    return res.status(500).json({ message: err.message });
  }
};






// 💰 Qarz to'lash
exports.payDebt = async (req, res) => {
  try {
    const { amount } = req.body;
    const rawNote =
      req.body?.payment_note ??
      req.body?.note ??
      req.body?.izoh ??
      req.body?.comment ??
      req.body?.description ??
      req.query?.note ??
      req.headers["x-payment-note"];
    const note =
      typeof rawNote === "string" && rawNote.trim()
        ? rawNote.trim()
        : "Qarz to'lovi";
    const sale = await Sale.findById(req.params.id);

    if (!sale) {
      return res.status(404).json({ message: "Sotuv topilmadi" });
    }

    if (!FINAL_STATUSES.includes(sale.status)) {
      return res.status(400).json({
        message: "Faqat tasdiqlangan/yakunlangan sotuvlar uchun qarz to'lanadi",
      });
    }

    const add = Number(amount) || 0;

    sale.paid_amount += add;
    sale.remaining_debt = Math.max(sale.total_amount - sale.paid_amount, 0);

    sale.payment_history.push({
      amount: add,
      date: new Date(),
      payment_note: note,
      note,
      izoh: note,
      comment: note,
      description: note,
    });
    sale.notes = note;

    await sale.save();

    // 🔥 HAR DOIM Customer ni qayta hisoblaymiz
    const customer = await Customer.findById(sale.customer_id);

    if (customer) {
      const allSales = await Sale.find({
        customer_id: customer._id,
        status: { $in: FINAL_STATUSES },
      });

      const totalPurchased = allSales.reduce(
        (sum, s) => sum + s.total_amount,
        0,
      );

      const totalPaid = allSales.reduce((sum, s) => sum + s.paid_amount, 0);

      customer.totalPurchased = totalPurchased;
      customer.totalPaid = totalPaid;
      customer.totalDebt = Math.max(totalPurchased - totalPaid, 0);

      await customer.save();
    }

    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 📊 Qarzchilar ro'yxati
exports.getDebtors = async (req, res) => {
  try {
    const debtors = await Sale.find({
      remaining_debt: { $gt: 0 },
      status: { $in: FINAL_STATUSES },
    })
      .populate("customer_id")
      .populate("agent_id", "name phone")
      .sort({ createdAt: -1 });

    return res.json({ success: true, debtors });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// 🔄 Faktura qayta chop etish (asosiy ma'lumot)
exports.reprintInvoice = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id).populate("customer_id");
    if (!sale) return res.status(404).json({ message: "Faktura topilmadi" });
    return res.json({
      success: true,
      message: "Faktura qayta chop etishga tayyor",
      sale,
    });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// ✏️ Yangilash
exports.updateSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });
    return res.json({ success: true, sale });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

// 🗑️ O'chirish
exports.deleteSale = async (req, res) => {
  try {
    const sale = await Sale.findByIdAndDelete(req.params.id);
    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });
    return res.json({ success: true, message: "Sotuv o'chirildi" });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};


exports.getSalesStats = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = {};

    if (from && to && !isNaN(new Date(from)) && !isNaN(new Date(to))) {
      const startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
      dateFilter.createdAt = { $gte: startDate, $lte: endDate };
    }

    const sales = await Sale.find(dateFilter)
      .populate({ path: "products.product_id", select: "purchase_price unit" })
      .populate("customer_id");

    const clients = await Client.find().select("paymentHistory");

    const stats = {
      total_sales_count: 0,
      total_revenue: 0,
      total_profit: 0,
      cash_total: 0,
      card_total: 0,
      debt_total: 0,
      product_details: {},
      store_debt_received: 0,
      supplier_payments_total: 0,
    };

    sales.forEach((sale) => {
      stats.total_sales_count++;
      stats.total_revenue += sale.total_amount || 0;

      // To'lov turlarini to'g'ri hisoblash
      const totalAmount = sale.total_amount || 0;
      const paidAmount = sale.paid_amount || 0;
      const remainingDebt = sale.remaining_debt || Math.max(totalAmount - paidAmount, 0);

      switch (sale.payment_method) {
        case "cash":
          stats.cash_total += totalAmount;
          break;
        case "card":
          stats.card_total += totalAmount;
          break;
        case "qarz":
          // Faqat qarz bo'lsa - hech narsa to'lanmagan
          stats.debt_total += remainingDebt;
          if (paidAmount > 0) {
            stats.cash_total += paidAmount; // qisman to'lov bo'lsa
          }
          break;
        case "mixed":
          // Aralash to'lov - qisman to'langan
          stats.cash_total += paidAmount;
          stats.debt_total += remainingDebt;
          break;
        default:
          // Boshqa holatlar uchun default
          if (remainingDebt > 0) {
            stats.cash_total += paidAmount;
            stats.debt_total += remainingDebt;
          } else {
            stats.cash_total += totalAmount;
          }
          break;
      }

      // Mahsulot bo'yicha foyda hisoblash
      (sale.products || []).forEach((p) => {
        // Purchase price ni product_id dan yoki to'g'ridan-to'g'ri p dan olish
        let purchasePrice = 0;
        if (p.product_id && p.product_id.purchase_price) {
          purchasePrice = Number(p.product_id.purchase_price) || 0;
        } else if (p.purchase_price) {
          purchasePrice = Number(p.purchase_price) || 0;
        }

        const sellPrice = Number(p.price) || 0;
        const qty = Number(p.quantity) || 0;

        const revenue = sellPrice * qty;
        const cost = purchasePrice * qty;
        const profit = revenue - cost;

        // Faqat to'g'ri ma'lumotlar bo'lsa foyda hisoblaymiz
        if (purchasePrice > 0 && sellPrice > 0 && qty > 0) {
          stats.total_profit += profit;
        }

        if (!stats.product_details[p.name]) {
          stats.product_details[p.name] = {
            revenue: 0,
            cost: 0,
            profit: 0,
            unit: p.unit || "dona",
            quantity_sold: 0,
          };
        }
        
        stats.product_details[p.name].revenue += revenue;
        stats.product_details[p.name].cost += cost;
        stats.product_details[p.name].profit += profit;
        stats.product_details[p.name].quantity_sold += qty;
      });

      // Do'kondan kelgan qarz to'lovlari
      (sale.payment_history || []).forEach((ph) => {
        if (ph.amount && ph.amount > 0) {
          stats.store_debt_received += ph.amount;
        }
      });
    });

    // Yetkazib beruvchiga to'lovlar
    clients.forEach((client) => {
      (client.paymentHistory || []).forEach((p) => {
        if (p.amount && p.amount > 0) {
          stats.supplier_payments_total += p.amount;
        }
      });
    });

    stats.total_profit = Number(stats.total_profit.toFixed(2));
    return res.json({ success: true, stats });
  } catch (err) {
    console.error("❌ getSalesStats error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
// controller
// ✅ Admin tomonidan sotuvni tasdiqlash va chek chiqarish
exports.approveSale = async (req, res) => {
  const session = await Sale.startSession();
  try {
    session.startTransaction();

    const sale = await Sale.findById(req.params.id)
      .populate("products.product_id")
      .session(session);
    if (!sale) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: "Sotuv topilmadi" });
    }

    if (sale.status !== "pending") {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: "Bu sotuv allaqachon tasdiqlangan yoki yakunlangan" });
    }

    // Pending zakaz tasdiqlanganda mahsulotni umumiy mavjud qoldiq bo'yicha ayiramiz.
    for (let p of sale.products) {
      const inventoryResult = await reserveStoreQuantityForSaleItem(p, session);
      if (!inventoryResult.success) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: inventoryResult.message });
      }
    }

    sale.status = "approved";
    await sale.save({ session });

    // Pending bo'lgan agent sotuvi tasdiqlanganda mijoz balansiga qo'shamiz
    const customer = await Customer.findById(sale.customer_id).session(session);
    if (customer) {
      const allSales = await Sale.find({
        customer_id: customer._id,
        status: { $in: FINAL_STATUSES },
      })
        .select("total_amount paid_amount")
        .session(session);

      const totalPurchased = allSales.reduce(
        (sum, s) => sum + (Number(s.total_amount) || 0),
        0
      );
      const totalPaid = allSales.reduce(
        (sum, s) => sum + (Number(s.paid_amount) || 0),
        0
      );

      customer.totalPurchased = totalPurchased;
      customer.totalPaid = totalPaid;
      customer.totalDebt = Math.max(totalPurchased - totalPaid, 0);
      await customer.save({ session });
    }

    await session.commitTransaction();
    session.endSession();
    res.json({ success: true, sale });
  } catch (err) {
    try {
      await session.abortTransaction();
    } catch (_) {}
    session.endSession();
    console.error("❌ approveSale error:", err);
    res.status(500).json({ message: err.message });
  }
};

// 📌 Admin: Bitta agent sotuvlari
exports.getSalesByAgent = async (req, res) => {
  try {
    const agentId = req.params.agentId || req.params.id;
    if (!agentId) {
      return res.status(400).json({ message: "Agent ID kiritilmadi" });
    }

    const sales = await Sale.find({ agent_id: agentId })
      .populate("customer_id", "name phone address totalDebt totalPaid")
      .populate("agent_id", "name phone")
      .sort({ createdAt: -1 });

    res.json({ success: true, sales });
  } catch (err) {
    console.error("❌ getSalesByAgent error:", err);
    res.status(500).json({ message: err.message });
  }
};
// PATCH /api/sales/:id/print
exports.markAsPrinted = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findByIdAndUpdate(
      id,
      { $set: { print_status: "printed", printedAt: new Date() } },
      { new: true }
    );

    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale topilmadi" });
    }

    res.json({ success: true, sale });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
