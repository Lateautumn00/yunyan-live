import { DataSource } from 'typeorm';
import { config } from 'dotenv';
import { User, LiveRoom, LiveParticipant } from '@yunyan-live/shared';

config();

export default new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, LiveRoom, LiveParticipant],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
