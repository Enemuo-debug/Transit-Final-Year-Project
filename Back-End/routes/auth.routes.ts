import { Router } from "express";
import { authController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.post("/register", authController.validateRegister, authController.register);
router.post("/register-responder", authController.validateRegisterResponder, authController.registerResponder);
router.post("/login", authController.validateLogin, authController.login);
router.post("/login-responder", authController.validateLogin, authController.loginResponder);
router.get("/me", authenticate, authController.me);

export const authRoutes = router;