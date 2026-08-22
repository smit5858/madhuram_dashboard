const { User, Role } = require("../models");
const { checkPassword } = require("../helper/common");
const { generateAccessToken } = require("../helper/token");

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({
      where: { email },
      include: { model: Role },
    });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const isValid = checkPassword(password, user.password);
    if (!isValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const roleName = user.Role ? user.Role.name : null;

    const payload = {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: roleName,
    };

    const accessToken = generateAccessToken(payload);

    return res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        roleName: roleName,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    // req.user is set by the authenticate middleware — logout route must be protected
    await User.update(
      { tokenInvalidatedAt: new Date() },
      { where: { id: req.user.id } },
    );
    return res.status(200).json({ success: true, message: "Logged out" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
