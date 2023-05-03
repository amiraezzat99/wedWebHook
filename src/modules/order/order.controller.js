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