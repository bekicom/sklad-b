const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    login: { type: String, required: true, unique: true },
    password: { type: String, required: true },

    // 🔑 Qo‘shimcha: rol qo‘shish — default qilib "afitsant"
    role: {
      type: String,
      enum: ["admin", "afitsant", "kassir"],
      default: "afitsant",
    },
  },
  { timestamps: true }
);

// Parolni hash qilish
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

// Parolni solishtirish methodi
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
