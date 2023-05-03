import mongoose, { Types } from 'mongoose'

const orderSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    products: [
      {
        productId: {
          type: Types.ObjectId,
          ref: 'Product',
          required: true,
        },
        quantity: {
          type: Number,
          required: true,
        },
        productPrice: { type: Number },
        finalPrice: { type: Number },
        name: { type: String },
      },
    ],
    address: { type: String, required: true },
    phone: { type: [String], required: true },
    subTotal: { type: Number, default: 1 },
    couponId: { type: mongoose.Schema.Types.ObjectId, ref: 'Coupon' },
    totalPrice: { type: Number, default: 1 },
    paymentMethod: {
      type: String,
      required: true,
      default: 'cash',
      enum: ['cash', 'card'],
    },
    orderStatus: {
      type: String,
      enum: [
        'pending',
        'confirmed',
        'placed',
        'on way',
        'deliverd',
        'canclled',
        'rejected',
      ],
    },
    reason: String,

  },
  {
    timestamps: true,
  },
)

const orderModel = mongoose.models.Order || mongoose.model('Order', orderSchema)

export default orderModel
