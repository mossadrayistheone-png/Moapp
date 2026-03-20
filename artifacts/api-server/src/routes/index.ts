import { Router, type IRouter } from "express";
import healthRouter from "./health";
import moRouter from "./mo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(moRouter);

export default router;
