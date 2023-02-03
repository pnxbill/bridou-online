import { Request, Response } from 'express'

import User, { UserType } from '../schemas/User'

class UserController {
  public async index (req: Request, res: Response): Promise<Response> {
    const users = await User.find()

    return res.json(users)
  }

  public async create (req: Request<unknown, unknown, UserType>, res: Response): Promise<Response> {
    try {
      const user = await User.create(req.body)
      return res.json(user)
    } catch (err) {
      global.log(err)
      return res.status(400).send(err)
    }
  }
}

export default new UserController()
