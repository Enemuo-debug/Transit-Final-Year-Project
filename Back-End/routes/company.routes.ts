import { Router } from "express";
import { companyController } from "../controllers/index.js";
import { authenticate } from "../middleware/index.js";

const router = Router();

router.get("/", companyController.getAllCompanies);
router.get("/:id", companyController.getCompanyById);
router.post("/", companyController.validateCreateCompany, companyController.createCompany);
router.put("/:id", authenticate, companyController.validateUpdateCompany, companyController.updateCompany);
router.delete("/:id", authenticate, companyController.deleteCompany);

export const companyRoutes = router;