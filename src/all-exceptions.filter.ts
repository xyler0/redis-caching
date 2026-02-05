import {
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    };

    // Log the error for debugging
    this.logger.error(
      `HTTP Status: ${status} Error: ${JSON.stringify(message)} Path: ${request.url}`,
      (exception as Error)?.stack, // Log stack trace for non-HttpExceptions
    );

    // If it's a generic error, also log the full exception object
    if (!(exception instanceof HttpException)) {
      this.logger.error('Full exception details:', exception);
    }

    response.status(status).json(errorResponse);
  }
}