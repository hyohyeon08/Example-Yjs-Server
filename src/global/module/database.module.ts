import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { env } from "../config/env.js";


@Module({
    imports: [
        TypeOrmModule.forRoot({
            type: 'postgres',
            host: env.database.host,
            port: Number(env.database.port),
            username: env.database.username,
            password: env.database.password,
            database: env.database.database,

            autoLoadEntities: true,
            synchronize: true
        })
    ]
})
export class DatabaseModule {}