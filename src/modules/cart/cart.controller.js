import cartModel from "../../../DB/model/Cart.model.js"
import productModel from "../../../DB/model/Product.model.js"




export const addToCart = async (req, res, next) => {
    const userId = req.user._id
    const { productId, quantity } = req.body
    const product = await productModel.findById(productId)
    if (product.stock < quantity || product.isDeleted) {
        await productModel.findByIdAndUpdate(productId, {
            $addToSet: {
                userAddToWishList: userId
            }
        })
        return next(new Error(
            'un-avaliable product', { cause: 400 }
        ))
    }
    
    const cart = await cartModel.findOne({ userId })
    if (!cart) {
        await cartModel.create({
            userId,
            products: [{ productId, quantity }]
        })
        return res.status(201).json({ message: "Done" })
    }
    // update product 
    let matchedProduct = false
    for (const product of cart.products) {
        if (product.productId.toString() == productId) {
            product.quantity = quantity
            matchedProduct = true
            break
        }
    }
    // add product
    if (!matchedProduct) {
        cart.products.push({ productId, quantity })
    }
    await cart.save()
    return res.status(200).json({ message: "Done", cart })
}