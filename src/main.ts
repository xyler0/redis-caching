import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './all-exceptions.filter'; // Import the new filter

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply global exception filter to catch all unhandled exceptions
  app.useGlobalFilters(new AllExceptionsFilter());

  await app.listen(3000);
  console.log(`Application is running on: ${await app.getUrl()}`);
}
bootstrap();
