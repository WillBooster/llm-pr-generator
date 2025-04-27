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
 * Represents a reaction group (not fully defined in the example)
 */
export type ReactionGroup = Record<string, string>;

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
 * Represents a GitHub issue
 */
export interface GitHubIssue {
  /** The issue's author */
  author: GitHubUser;
  /** The issue's description */
  body: string;
  /** Comments on the issue */
  comments: GitHubComment[];
  /** The issue's title */
  title: string;
}
