// new Error(';yfghgjh')
export class ApiFeatures {
  // mongooseQuery = model.find() , queryData = req.query
  constructor(mongooseQuery, queryData) {
    this.mongooseQuery = mongooseQuery
    this.queryData = queryData
  }

  paginate() {
    let { page, size } = this.queryData
    if (!page || page < 1) page = 1
    if (!size || size < 1) size = 2
    this.mongooseQuery
      .limit(parseInt(size))
      .skip((parseInt(page) - 1) * parseInt(size))
    return this
  }
  sort() {
    this.mongooseQuery.sort(this.queryData.sort?.replaceAll(',', ' '))
    return this
  }
  select() {
    this.mongooseQuery.select(this.queryData.fields?.replaceAll(',', ' '))
    return this
  }
  search() {
    this.mongooseQuery.find({
      $or: [
        { name: { $regex: this.queryData.search, $options: 'i' } },
        { description: { $regex: this.queryData.search, $options: 'i' } },
      ],
    })
    return this
  }

  filter() {
    const queryRequest = { ...this.queryData }
    const execludedFields = ['page', 'size', 'search', 'sort', 'fields']
    execludedFields.forEach((param) => delete queryRequest[param])
    const queryData = JSON.parse(
      JSON.stringify(queryRequest).replace(
        /(lt|lte|gte|gt|in|nin|eq|neq)/g,
        (match) => `$${match}`,
      ),
    )
    this.mongooseQuery.find(queryData)
    return this
  }
}
