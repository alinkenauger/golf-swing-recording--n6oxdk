import { Schema, model, Document } from 'mongoose'; // mongoose ^7.5.0
import { MessageType, MessageStatus, MediaMessageMetadata, MessageReaction } from '../types';
import { Thread } from './thread.model';

/**
 * Interface for message document extending Mongoose Document
 */
export interface IMessage extends Document {
  threadId: Schema.Types.ObjectId;
  senderId: Schema.Types.ObjectId;
  type: MessageType;
  content: string;
  status: MessageStatus;
  readBy: Array<{
    userId: Schema.Types.ObjectId;
    timestamp: Date;
  }>;
  deliveredTo: Array<{
    userId: Schema.Types.ObjectId;
    timestamp: Date;
  }>;
  metadata: MediaMessageMetadata;
  replyTo?: Schema.Types.ObjectId;
  reactions: MessageReaction[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Mongoose schema for chat messages with comprehensive tracking and validation
 */
export const messageSchema = new Schema<IMessage>({
  threadId: {
    type: Schema.Types.ObjectId,
    ref: 'Thread',
    required: true,
    index: true
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: Object.values(MessageType),
    required: true,
    default: MessageType.TEXT
  },
  content: {
    type: String,
    required: true,
    maxlength: 5000
  },
  status: {
    type: String,
    enum: Object.values(MessageStatus),
    default: MessageStatus.SENDING,
    required: true
  },
  readBy: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  deliveredTo: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  metadata: {
    mimeType: String,
    thumbnailUrl: String,
    width: Number,
    height: Number,
    codec: String,
    bitrate: Number,
    transcoded: {
      type: Boolean,
      default: false
    }
  },
  replyTo: {
    type: Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  reactions: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    emoji: {
      type: String,
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  versionKey: false
});

/**
 * Index definitions for optimized queries
 */
messageSchema.index({ createdAt: -1 });
messageSchema.index({ 'readBy.userId': 1 });
messageSchema.index({ 'deliveredTo.userId': 1 });
messageSchema.index({ type: 1, threadId: 1 });

/**
 * Marks message as read by a user with real-time notification
 */
messageSchema.methods.markAsRead = async function(userId: string): Promise<void> {
  const thread = await Thread.findById(this.threadId);
  if (!thread) {
    throw new Error('Thread not found');
  }

  const isParticipant = await thread.isParticipant(userId);
  if (!isParticipant) {
    throw new Error('User is not a thread participant');
  }

  const alreadyRead = this.readBy.some(read => read.userId.toString() === userId);
  if (!alreadyRead) {
    this.readBy.push({
      userId,
      timestamp: new Date()
    });

    this.status = MessageStatus.READ;
    await this.save();

    // Emit real-time read receipt event via Socket.io
    global.io?.to(this.threadId.toString()).emit('message:read', {
      messageId: this._id,
      userId,
      threadId: this.threadId,
      timestamp: new Date()
    });
  }
};

/**
 * Marks message as delivered to a user with delivery tracking
 */
messageSchema.methods.markAsDelivered = async function(userId: string): Promise<void> {
  const thread = await Thread.findById(this.threadId);
  if (!thread) {
    throw new Error('Thread not found');
  }

  const isParticipant = await thread.isParticipant(userId);
  if (!isParticipant) {
    throw new Error('User is not a thread participant');
  }

  const alreadyDelivered = this.deliveredTo.some(delivery => 
    delivery.userId.toString() === userId
  );

  if (!alreadyDelivered) {
    this.deliveredTo.push({
      userId,
      timestamp: new Date()
    });

    if (this.status === MessageStatus.SENDING) {
      this.status = MessageStatus.DELIVERED;
    }
    await this.save();

    // Emit real-time delivery event via Socket.io
    global.io?.to(this.threadId.toString()).emit('message:delivered', {
      messageId: this._id,
      userId,
      threadId: this.threadId,
      timestamp: new Date()
    });
  }
};

/**
 * Pre-save middleware to validate thread participants
 */
messageSchema.pre('save', async function(next) {
  if (this.isNew) {
    const thread = await Thread.findById(this.threadId);
    if (!thread) {
      throw new Error('Thread not found');
    }

    const isParticipant = await thread.isParticipant(this.senderId.toString());
    if (!isParticipant) {
      throw new Error('Sender is not a thread participant');
    }
  }
  next();
});

// Create and export the Message model
export const Message = model<IMessage>('Message', messageSchema);