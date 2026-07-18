import type {
  Db,
} from 'mongodb';

export interface Migration {
  id: string;
  description: string;
  up(database: Db): Promise<void>;
}