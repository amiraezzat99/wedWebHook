import Joi from "joi";
import { generalFields } from "../../middleware/validation.js";


export const createOrderSchema = Joi.object({
    products: Joi.array().items(
        Joi.object({
            productId: generalFields.id,
            quantity: Joi.number().integer().positive().min(1).required()
        }).required()
    ).optional(),
    address: Joi.string().required(),
    phone: Joi.array().items(
        Joi.string().regex(/^(002|\+2)?01[0125][0-9]{8}$/).required()
    ).required(),
    paymentMethod: Joi.string().valid('card', 'cash'),
    couponCode: Joi.string().optional(),

}).required()