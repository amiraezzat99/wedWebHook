import cartModel from '../../../DB/model/Cart.model.js'
import couponModel from '../../../DB/model/Coupon.model.js'
import orderModel from '../../../DB/model/Order.model.js'
import productModel from '../../../DB/model/Product.model.js'
import createInvoice from '../../utils/pdfkit.js'
import { validateCoupon } from '../coupon/coupon.controller.js'
import sendEmail from '../../utils/sendEmail.js'
import { payment } from '../../utils/payment.js'
import Stripe from 'stripe'

// create order
export const createOrder = async (req, res, next) => {
  const userId = req.user._id
  const { products, address, phone, couponCode, paymentMethod } = req.body

  // coupon validation
  if (couponCode) {
    const coupon = await couponModel.findOne({ code: couponCode })
    if (!coupon) {
      return next(new Error('in-valid coupon code', { cause: 400 }))
    }
    //validate
    const { matched, expired, exceed } = validateCoupon(coupon, userId)
    if (!matched) {
      return next(
        new Error('this coupon does not assgined to you', { cause: 400 }),
      )
    }
    if (exceed) {
      return next(
        new Error('you exceed the maxUsage of this coupon', { cause: 400 }),
      )
    }
    if (expired) {
      return next(new Error('coupon is expired', { cause: 400 }))
    }
    req.body.coupon = coupon
  }

  if (!products?.length) {
    const cartExist = await cartModel.findOne({ userId })
    if (!cartExist?.products?.length) {
      return next(new Error('empty cart products', { cause: 400 }))
    }
    req.body.products = cartExist.products
  }
  let finalProductsList = []
  let subTotal = 0
  let productIds = []
  for (const product of req.body.products) {
    //  productId
    // quantity
    // productPrice
    // finalPrice
    // name
    const findProduct = await productModel.findOne({
      _id: product.productId,
      stock: { $gte: product.quantity },
      isDeleted: false,
    })
    if (!findProduct) {
      return next(new Error('un-available products'))
    }
    productIds.push(product.productId)
    product.name = findProduct.name
    product.productPrice = findProduct.priceAfterDiscount
    product.finalPrice = Number.parseFloat(
      product.quantity * findProduct.priceAfterDiscount,
    ).toFixed(2)
    finalProductsList.push(product)
    subTotal += parseInt(product.finalPrice)
  }
  //  (subTotal);
  //  (finalProductsList);
  paymentMethod == 'card'
    ? (req.body.orderStatus = 'pending')
    : (req.body.orderStatus = 'placed')
  const orderObject = {
    userId,
    products: finalProductsList,
    address,
    phone,
    subTotal,
    couponId: req.body.coupon?._id,
    totalPrice: Number.parseFloat(
      subTotal * (1 - (req.body.coupon?.amount || 0) / 100),
    ).toFixed(2),
    paymentMethod,
    orderStatus: req.body.orderStatus,
  }
  const order = await orderModel.create(orderObject)
  if (order) {
    // payment
    let session
    if (order.paymentMethod == 'card') {
      if (req.body.coupon) {
        const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
        const coupon = await stripe.coupons.create({
          percent_off: req.body.coupon.amount,
        })
        req.body.couponId = coupon.id
      }
      session = await payment({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: req.user.email,
        metadata: {
          orderId: order._id.toString(),
          phone: order.phone[0],
        },
        cancel_url: `${process.env.CANCEL_URL}?orderId=${order._id}`,
        success_url: `${process.env.SUCCESS_URL}?orderId=${order._id}`,
        discounts: req.body.couponId ? [{ coupon: req.body.couponId }] : [],
        line_items: order.products.map((product) => {
          return {
            price_data: {
              currency: 'EGP',
              product_data: {
                name: product.name,
              },
              unit_amount: product.productPrice * 100,
            },
            quantity: product.quantity,
          }
        }),
      })
    }
    // coupon usage count  +1
    if (req.body.coupon) {
      for (const assginedUser of req.body.coupon?.usagePerUser) {
        if (assginedUser.userId.toString() == userId) {
          assginedUser.usageCount += 1
          await req.body.coupon.save()
        }
      }
    }
    // product stock -qnatity
    for (const product of order.products) {
      await productModel.findByIdAndUpdate(product.productId, {
        $inc: { stock: -parseInt(product.quantity) },
      })
    }

    // cart pull by productId
    await cartModel.findOneAndUpdate(
      { userId },
      {
        $pull: {
          products: {
            productId: { $in: productIds },
          },
        },
      },
    )

    // generate invoice
    // const invoice = {
    //   shipping: {
    //     name: req.user.userName,
    //     address: order.address,
    //     city: 'Cairo',
    //     state: 'Cairo',
    //     country: 'Egypt',
    //     postal_code: 94111,
    //   },
    //   items: order.products,
    //   subtotal: order.subTotal,
    //   paid: order.totalPrice,
    //   invoice_nr: 1234,
    //   date: order.createdAt,
    // }
    // await createInvoice(invoice, 'invoice.pdf')
    // // send invoice
    // await sendEmail({
    //   to: req.user.email,
    //   message: 'please check your invoice',
    //   subject: 'Order Invoice',
    //   attachments: [{ path: 'invoice.pdf' }],
    // })
    return res.status(201).json({ message: 'Done', order, session })
  }
}

//======================= web hoook =========================
//======================= web hoook =========================
export const webHook = async (req, res, next) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  // This is your Stripe CLI webhook secret for testing your endpoint locally.
  const endpointSecret = 'whsec_qdUCw8MtgvQCqri18dhmejnGmj9Zkh99'

  const sig = req.headers['stripe-signature']

  let event

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret)
  } catch (err) {
    res.status(400).send(`Webhook Error: ${err.message}`)
    return
  }

  // Handle the event
  const { orderId } = event.data.object.metadata
  if (event.type == 'checkout.session.completed') {
    await orderModel.findByIdAndUpdate(orderId, {
      orderStatus: 'confirmed',
    })
    return res.status(200).json({ messgae: 'Payment successed' })
  }
  await orderModel.findByIdAndUpdate(orderId, {
    orderStatus: 'payment failed',
  })
  return res.status(200).json({ messgae: 'Payment failed' })
}

// {
//   "id": "evt_1N3jBwKK3qD4EuatRFrXfb2C",
//   "object": "event",
//   "api_version": "2022-11-15",
//   "created": 1683133812,
//   "data": {
//     "object": {
//       "id": "cs_test_b1L7JzgWwxLrrQwWeqCga6UcqrLIwTBhY7gBZyAMGqj9zCL4UjPu2YlmTq",
//       "object": "checkout.session",
//       "after_expiration": null,
//       "allow_promotion_codes": null,
//       "amount_subtotal": 140000,
//       "amount_total": 70000,
//       "automatic_tax": {
//         "enabled": false,
//         "status": null
//       },
//       "billing_address_collection": null,
//       "cancel_url": "http://localhost:3000/cancel?orderId=6452a334094ded708f4e80c7",
//       "client_reference_id": null,
//       "consent": null,
//       "consent_collection": null,
//       "created": 1683133738,
//       "currency": "egp",
//       "currency_conversion": null,
//       "custom_fields": [
//       ],
//       "custom_text": {
//         "shipping_address": null,
//         "submit": null
//       },
//       "customer": null,
//       "customer_creation": "if_required",
//       "customer_details": {
//         "address": {
//           "city": null,
//           "country": "EG",
//           "line1": null,
//           "line2": null,
//           "postal_code": null,
//           "state": null
//         },
//         "email": "amiraezaatroute4@gmail.com",
//         "name": "amira ezaat ewis",
//         "phone": null,
//         "tax_exempt": "none",
//         "tax_ids": [
//         ]
//       },
//       "customer_email": "amiraezaatroute4@gmail.com",
//       "expires_at": 1683220138,
//       "invoice": null,
//       "invoice_creation": {
//         "enabled": false,
//         "invoice_data": {
//           "account_tax_ids": null,
//           "custom_fields": null,
//           "description": null,
//           "footer": null,
//           "metadata": {
//           },
//           "rendering_options": null
//         }
//       },
//       "livemode": false,
//       "locale": null,
//       "metadata": {
//         "orderId": "6452a334094ded708f4e80c7",
//         "phone": "+201142255517"
//       },
//       "mode": "payment",
//       "payment_intent": "pi_3N3jBuKK3qD4Euat0AWk5fRU",
//       "payment_link": null,
//       "payment_method_collection": "always",
//       "payment_method_options": {
//       },
//       "payment_method_types": [
//         "card"
//       ],
//       "payment_status": "paid",
//       "phone_number_collection": {
//         "enabled": false
//       },
//       "recovered_from": null,
//       "setup_intent": null,
//       "shipping_address_collection": null,
//       "shipping_cost": null,
//       "shipping_details": null,
//       "shipping_options": [
//       ],
//       "status": "complete",
//       "submit_type": null,
//       "subscription": null,
//       "success_url": "http://localhost:3000/success?orderId=6452a334094ded708f4e80c7",
//       "total_details": {
//         "amount_discount": 70000,
//         "amount_shipping": 0,
//         "amount_tax": 0
//       },
//       "url": null
//     }
//   },
//   "livemode": false,
//   "pending_webhooks": 6,
//   "request": {
//     "id": null,
//     "idempotency_key": null
//   },
//   "type": "checkout.session.completed"
// }
