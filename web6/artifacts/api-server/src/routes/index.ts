import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import plansRouter from "./plans.js";
import usersRouter from "./users.js";
import ordersRouter from "./orders.js";
import referralsRouter from "./referrals.js";
import adminRouter from "./admin.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(plansRouter);
router.use(usersRouter);
router.use(ordersRouter);
router.use(referralsRouter);
router.use(adminRouter);

export default router;
