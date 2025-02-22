import { Schema, model, Document } from 'mongoose'; // mongoose ^7.5.0
import { UserRole } from '../../../shared/types';

/**
 * Interface for thread metadata including video responses and active participants
 */
interface ThreadMetadata {
  videoResponses: Array<{
    videoId: string;
    thumbnail: string;
    duration?: number;
    addedAt: Date;
  }>;
  activeParticipants: string[];
  lastActivity: Date;
}

/**
 * Interface for thread participant with role information
 */
interface ThreadParticipant {
  userId: Schema.Types.ObjectId;
  role: UserRole;
  joinedAt: Date;
  lastSeen: Date;
}

/**
 * Interface for thread document extending Mongoose Document
 */
export interface IThread extends Document {
  title: string;
  type: 'direct' | 'group';
  participants: ThreadParticipant[];
  lastMessageAt: Date;
  createdBy: Schema.Types.ObjectId;
  metadata: ThreadMetadata;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
}

/**
 * Mongoose schema for chat threads with comprehensive features
 */
export const threadSchema = new Schema<IThread>({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  type: {
    type: String,
    enum: ['direct', 'group'],
    required: true,
    default: 'direct'
  },
  participants: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    role: {
      type: String,
      enum: Object.values(['admin', 'coach', 'athlete']),
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    lastSeen: {
      type: Date,
      default: Date.now
    }
  }],
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  metadata: {
    videoResponses: [{
      videoId: {
        type: String,
        required: true
      },
      thumbnail: {
        type: String,
        required: true
      },
      duration: Number,
      addedAt: {
        type: Date,
        default: Date.now
      }
    }],
    activeParticipants: [String],
    lastActivity: {
      type: Date,
      default: Date.now
    }
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  versionKey: false
});

/**
 * Index definitions for optimized queries
 */
threadSchema.index({ participants: 1 });
threadSchema.index({ lastMessageAt: -1 });
threadSchema.index({ 'metadata.lastActivity': -1 });
threadSchema.index({ createdAt: -1 });

/**
 * Checks if a user is a participant with specific role in the thread
 */
threadSchema.methods.isParticipant = async function(
  userId: string,
  role?: UserRole
): Promise<boolean> {
  const participant = this.participants.find(p => 
    p.userId.toString() === userId && (!role || p.role === role)
  );
  return !!participant;
};

/**
 * Adds a new participant to the thread with role validation
 */
threadSchema.methods.addParticipant = async function(
  userId: string,
  role: UserRole
): Promise<void> {
  if (await this.isParticipant(userId)) {
    throw new Error('User is already a participant');
  }

  this.participants.push({
    userId,
    role,
    joinedAt: new Date(),
    lastSeen: new Date()
  });

  this.metadata.lastActivity = new Date();
  await this.save();
};

/**
 * Removes a participant from the thread
 */
threadSchema.methods.removeParticipant = async function(
  userId: string
): Promise<void> {
  const participantIndex = this.participants.findIndex(
    p => p.userId.toString() === userId
  );

  if (participantIndex === -1) {
    throw new Error('User is not a participant');
  }

  this.participants.splice(participantIndex, 1);
  this.metadata.activeParticipants = this.metadata.activeParticipants.filter(
    id => id !== userId
  );
  
  this.metadata.lastActivity = new Date();
  await this.save();
};

/**
 * Updates participant's last seen timestamp
 */
threadSchema.methods.updateParticipantLastSeen = async function(
  userId: string
): Promise<void> {
  const participant = this.participants.find(
    p => p.userId.toString() === userId
  );

  if (participant) {
    participant.lastSeen = new Date();
    this.metadata.lastActivity = new Date();
    await this.save();
  }
};

/**
 * Adds a video response to the thread
 */
threadSchema.methods.addVideoResponse = async function(
  videoId: string,
  thumbnail: string,
  duration?: number
): Promise<void> {
  this.metadata.videoResponses.push({
    videoId,
    thumbnail,
    duration,
    addedAt: new Date()
  });
  
  this.metadata.lastActivity = new Date();
  await this.save();
};

// Create and export the Thread model
export const Thread = model<IThread>('Thread', threadSchema);