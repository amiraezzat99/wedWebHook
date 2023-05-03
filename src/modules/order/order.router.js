import { Router } from "express";
import auth from "../../middleware/auth.js";
import { validation } from "../../middleware/validation.js";
import { asyncHandler } from "../../utils/errorHandling.js";
import { createOrder } from "./order.controller.js";
const router = Router()


import * as validators from './order.validation.js'

router.get('/', (req, res) => {
    res.status(200).json({ message: "order Module" })
})



router.post('/', auth(), validation(validators.createOrderSchema), asyncHandler(createOrder))


export default router