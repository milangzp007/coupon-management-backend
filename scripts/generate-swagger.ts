// Polyfill for Node.js v16 - crypto global
import { randomUUID } from 'crypto';
if (!global.crypto) {
  (global as any).crypto = {
    randomUUID,
  };
}

import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { AppModule } from '../src/app.module';

async function generateSwagger() {
  const app = await NestFactory.create(AppModule);

  const config = new DocumentBuilder()
    .setTitle('Coupon Management System API')
    .setDescription('API documentation for Coupon Code Management System - Backend Technical Challenge')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Authentication endpoints')
    .addTag('coupons', 'Customer coupon endpoints')
    .addTag('orders', 'Order management endpoints')
    .addTag('admin', 'Admin management endpoints')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  
  // Write to file
  const outputPath = join(process.cwd(), 'swagger.json');
  writeFileSync(outputPath, JSON.stringify(document, null, 2));
  
  console.log(`✅ Swagger specification generated at: ${outputPath}`);
  
  await app.close();
  process.exit(0);
}

generateSwagger().catch((error) => {
  console.error('❌ Error generating Swagger specification:', error);
  process.exit(1);
});

