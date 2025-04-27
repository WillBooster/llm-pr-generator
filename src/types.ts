/**
 * Represents a GitHub user
 */
export interface GitHubUser {
  /** The user's GitHub ID */
  id: string;
  /** Whether the user is a bot */
  is_bot: boolean;
  /** The user's GitHub username */
  login: string;
  /** The user's full name */
  name?: string;
}

/**
 * Represents a comment author with minimal information
 */
export interface CommentAuthor {
  /** The author's GitHub username */
  login: string;
}

/**
 * Represents users who reacted with a specific reaction
 */
export interface ReactionUsers {
  /** The total count of users who reacted */
  totalCount: number;
}

/**
 * Represents a reaction group on a comment or issue
 */
export interface ReactionGroup {
  /** The type of reaction (e.g., THUMBS_UP, LAUGH) */
  content: string;
  /** Users who reacted */
  users: ReactionUsers;
}

/**
 * Represents a GitHub issue comment
 */
export interface GitHubComment {
  /** The comment's unique ID */
  id: string;
  /** The comment's author */
  author: CommentAuthor;
  /** The author's association with the repository */
  authorAssociation: string;
  /** The comment's content */
  body: string;
  /** When the comment was created */
  createdAt: string;
  /** Whether the comment includes an edit made at creation time */
  includesCreatedEdit: boolean;
  /** Whether the comment is minimized */
  isMinimized: boolean;
  /** The reason the comment was minimized, if applicable */
  minimizedReason: string;
  /** Reaction groups on the comment */
  reactionGroups: ReactionGroup[];
  /** URL to the comment */
  url: string;
  /** Whether the current viewer authored the comment */
  viewerDidAuthor: boolean;
}

/**
 * Represents a GitHub label
 */
export interface GitHubLabel {
  /** The label's unique ID */
  id: string;
  /** The label's name */
  name: string;
  /** The label's description (optional) */
  description?: string;
  /** The label's color (hex code without #) */
  color: string;
}

/**
 * Represents a GitHub issue
 */
export interface GitHubIssue {
  /** The issue's author */
  author: GitHubUser;
  /** The issue's description */
  body: string;
  /** Comments on the issue */
  comments: GitHubComment[];
  /** Labels attached to the issue */
  labels: GitHubLabel[];
  /** The issue's title */
  title: string;
}
