import mongoose, { Schema, Document } from 'mongoose';

export interface ISubscription extends Document {
  userId: string;
  paypalSubscriptionId: string;
  paypalPayerId: string;
  plan: 'free' | 'pro' | 'business';
  status: 'active' | 'past_due' | 'canceled' | 'trialing' | 'incomplete';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
}

const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: String, required: true, unique: true, index: true },
    paypalSubscriptionId: { type: String, index: true, sparse: true, default: null },
    paypalPayerId: { type: String, index: true, sparse: true, default: null },
    plan: {
      type: String,
      enum: ['free', 'pro', 'business'],
      default: 'free',
    },
    status: {
      type: String,
      enum: ['active', 'past_due', 'canceled', 'trialing', 'incomplete'],
      default: 'active',
    },
    currentPeriodStart: Date,
    currentPeriodEnd: Date,
    cancelAtPeriodEnd: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Subscription ||
  mongoose.model<ISubscription>('Subscription', SubscriptionSchema);
