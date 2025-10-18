const Sale = require("../models/Sale");
const Customer = require("../models/Customer");
const Store = require("../models/Store");
const Client = require("../models/Client");
const { io } = require("../index");
const Agent = require("../models/Agent");
// 🛒 Sotuv yaratish


exports.createSale = async (req, res) => {
  try {
    let { customer, products, paid_amount, payment_method, shop_info } =
      req.body;
    paid_amount = Number(paid_amount) || 0;

    // 🔑 Agentni token orqali olish
    const agentId = req.user?.agentId || req.user?._id || null;
    const isAgent = req.user?.role === "agent";

    // Agent ma'lumotlarini olish (agar agent bo'lsa)
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

      // Ombordan kamaytirish (AVTOMATIK)
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
      status: "completed", // Agent sotuvi avtomatik completed
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

    // 6) Mijoz balansini yangilash
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

      console.log(
        `✅ Socket signal yuborildi: ${isAgent ? "Agent" : "Admin"} sotuv`
      );
    } else {
      console.warn(
        "⚠️ Socket.io topilmadi, real-time bildirishnoma yuborilmadi"
      );
    }

    // 9) Log yozish
    console.log(`📊 Yangi sotuv yaratildi:`, {
      invoice_number: sale.invoice_number,
      customer: customerData.name,
      agent: agentData?.name || "Admin",
      total: total_amount,
      products_count: saleProducts.length,
    });

    return res.json({
      success: true,
      sale: populatedSale,
      customer: customerData,
      message: isAgent
        ? "Agent sotuv muvaffaqiyatli amalga oshirildi"
        : "Sotuv muvaffaqiyatli amalga oshirildi",
    });
  } catch (err) {
    console.error("❌ createSale error:", err);

    // Xatolik bo'lganda omborga qaytarish (rollback)
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
    const { agentId, from, to } = req.query;

    // Agent ID bo'yicha filtr
    if (agentId) filter.agent_id = agentId;

    // Sana bo'yicha filtr
    if (from && to && !isNaN(new Date(from)) && !isNaN(new Date(to))) {
      const startDate = new Date(from);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(to);
      endDate.setHours(23, 59, 59, 999);
      filter.createdAt = { $gte: startDate, $lte: endDate };
    }

    // Sotuvlarni olish (Agent model'siz, faqat ma'lumotlarni olish)
    const sales = await Sale.find(filter)
      .populate("customer_id", "name phone address")
      .sort({ createdAt: -1 });

    // Agent ma'lumotlarini qo'lda qo'shish (agar agent_info da saqlangan bo'lsa)
    const salesWithAgentInfo = sales.map((sale) => {
      const saleObj = sale.toObject();

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

      return saleObj;
    });

    return res.json({
      success: true,
      sales: salesWithAgentInfo,
      count: salesWithAgentInfo.length,
      agentCount: salesWithAgentInfo.filter(
        (s) => s.sale_type === "agent" || s.agent_id
      ).length,
    });
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

// 🧾 Faktura ma'lumotlari (print)
exports.getInvoiceData = async (req, res) => {
  try {
    const sale = await Sale.findById(req.params.id)
      .populate("customer_id")
      .populate("products.product_id")
      .populate("agent_id", "name phone location");

    if (!sale) return res.status(404).json({ message: "Faktura topilmadi" });

    // Agent ma'lumotlarini olish
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
        name: sale.customer_id?.name,
        phone: sale.customer_id?.phone,
        address: sale.customer_id?.address,
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
        payment_method: sale.payment_method,
        payment_status: sale.remaining_debt > 0 ? "qarz" : "to'liq to'langan",
      },

      // Agent ma'lumotlarini qo'shish
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

      // Agent bo'lmasa admin sotuvi
      ...(!isAgentSale && {
        seller: "Admin",
        isAgentSale: false,
      }),

      // Qo'shimcha ma'lumotlar
      check_number: sale.check_number || String(sale._id).slice(-6),
    };

    return res.json({ success: true, invoice: invoiceData });
  } catch (err) {
    console.error("getInvoiceData error:", err);
    return res.status(500).json({ message: err.message });
  }
};




// 💰 Qarz to'lash
exports.payDebt = async (req, res) => {
  try {
    const { amount, method } = req.body; // method qo‘shish foydali (naqd/karta)
    const sale = await Sale.findById(req.params.id);
    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });

    const add = Number(amount) || 0;
    if (add <= 0)
      return res
        .status(400)
        .json({ message: "To'lov miqdori > 0 bo'lishi kerak" });
    if (add > sale.remaining_debt) {
      return res
        .status(400)
        .json({ message: "To'lov miqdori qarzdan oshmasligi kerak" });
    }

    // To'lovni qo‘shish
    sale.paid_amount += add;
    sale.remaining_debt = Math.max(sale.total_amount - sale.paid_amount, 0);

    sale.payment_history = sale.payment_history || [];
    sale.payment_history.push({
      amount: add,
      date: new Date(),
      method: method || "cash",
    });

    // ✅ To‘lov usuli aniqlash
    if (sale.remaining_debt === 0) {
      // qarz yopilgan → oxirgi to‘lov methodiga qarab belgilaymiz
      sale.payment_method = method || sale.payment_method || "cash";
    } else {
      // qisman yopilgan
      sale.payment_method = "mixed";
    }

    await sale.save();

    // ✅ Mijoz balansini yangilash
    const customer = await Customer.findById(sale.customer_id);
    if (customer) {
      if (typeof customer.updateBalance === "function") {
        await customer.updateBalance(0, add); // 0 = purchase qo‘shilmadi, add = to‘lov qo‘shildi
      } else {
        customer.totalPaid = (customer.totalPaid || 0) + add;
        customer.totalDebt = Math.max(
          (customer.totalPurchased || 0) - customer.totalPaid,
          0
        );
        await customer.save();
      }
    }

    return res.json({ success: true, sale });
  } catch (err) {
    console.error("payDebt error:", err);
    return res.status(500).json({ message: err.message });
  }
};

// 📊 Qarzchilar ro'yxati
exports.getDebtors = async (req, res) => {
  try {
    const debtors = await Sale.find({ remaining_debt: { $gt: 0 } })
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
  try {
    const sale = await Sale.findById(req.params.id).populate(
      "products.product_id"
    );
    if (!sale) return res.status(404).json({ message: "Sotuv topilmadi" });

    if (sale.status !== "pending") {
      return res
        .status(400)
        .json({ message: "Bu sotuv allaqachon tasdiqlangan yoki yakunlangan" });
    }

    // Ombordan mahsulotlarni kamaytirish
    for (let p of sale.products) {
      const product = await Store.findById(p.product_id);
      if (!product || product.quantity < p.quantity) {
        return res
          .status(400)
          .json({ message: `Omborda ${p.name} yetarli emas` });
      }
      product.quantity -= p.quantity;
      await product.save();
    }

    sale.status = "approved";
    await sale.save();

    res.json({ success: true, sale });
  } catch (err) {
    console.error("❌ approveSale error:", err);
    res.status(500).json({ message: err.message });
  }
};

// 📌 Admin: Bitta agent sotuvlari
exports.getSalesByAgent = async (req, res) => {
  try {
    const { agentId } = req.params;
    if (!agentId) {
      return res.status(400).json({ message: "Agent ID kiritilmadi" });
    }

    const sales = await Sale.find({ agent_id: agentId })
      .populate("customer_id", "name phone address")
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
