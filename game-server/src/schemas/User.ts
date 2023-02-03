import { Schema, model, Document } from 'mongoose'
import uniqueValidator from 'mongoose-unique-validator'

export interface UserType extends Document {
  email: string
  firstName: string
  lastName: string
}

const UserSchema = new Schema({
  email: {
    type: String,
    unique: true,
    required: true,
    match: /^[\w+.]+@\w+\.\w{2,}(?:\.\w{2})?$/
  },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true }
}, {
  timestamps: true
})

UserSchema.plugin(uniqueValidator, { message: '{PATH} already in use' })

export default model<UserType>('User', UserSchema)
