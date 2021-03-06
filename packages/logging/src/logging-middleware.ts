import express from 'express-serve-static-core'
import { v4 as uuidv4 } from 'uuid'
import { Logger } from 'typescript-log'
import { logEscalator, EscalatingLog } from './log-escalator'

export interface WithLoggingInfo {
    requestId: string
    caller?: string
    log: Logger
    startTime: number
}

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        // eslint-disable-next-line @typescript-eslint/no-empty-interface
        export interface Request extends WithLoggingInfo {}
        export interface Response {
            endTime: number
        }
    }
}

export interface LoggingMiddlewareOptions {
    disableDebugQueryString?: boolean
    createRequestId?: () => string
    now?: () => number

    sampling?: {
        debugPercentage: number
        infoPercentage: number
    }
}

export function expressRequestLoggingMiddleware(
    log: Logger,
    {
        disableDebugQueryString = process.env.DISABLE_DEBUG_LOG_QS === 'true',
        createRequestId = uuidv4,
        now = Date.now,
        sampling,
    }: LoggingMiddlewareOptions = {},
): express.RequestHandler {
    return loggingMiddleware

    function onResFinished(this: express.Response, err?: Error) {
        this.removeListener('finish', onResFinished)
        this.removeListener('close', onResClose)
        this.removeListener('error', onResFinished)
        const req = this.req!

        this.endTime = now()
        const responseTime = this.endTime - req.startTime
        const log = this.req!.log as EscalatingLog

        if (err) {
            log.error({ res: this, err, responseTime }, 'request errored')
            log.emitAndStopBuffering()
            return
        }

        log.info({ req, res: this, responseTime }, 'end request')
        log.emitAndStopBuffering()
    }

    function onResClose(this: express.Response) {
        this.removeListener('finish', onResFinished)
        this.removeListener('close', onResClose)
        this.removeListener('error', onResFinished)

        this.endTime = now()
        const responseTime = this.endTime - this.req!.startTime
        const log = this.req!.log as EscalatingLog
        log.info({ req: this.req!, res: this, responseTime }, 'end request - connection closed')
        log.emitAndStopBuffering()
    }
    function loggingMiddleware(
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
    ) {
        req.requestId = req.header('x-request-id') || createRequestId()
        const caller = req.header('Caller')
        if (caller) {
            req.caller = caller
        }
        const childOptions = { requestId: req.requestId }
        if ('debug_log' in req.query && !disableDebugQueryString) {
            ;(childOptions as any).level = 'debug'
        } else if (sampling) {
            const threshold = Math.random() * 100
            if (threshold < sampling.debugPercentage) {
                ;(childOptions as any).level = 'debug'
            } else if (threshold < sampling.infoPercentage) {
                ;(childOptions as any).level = 'info'
            }
        }

        req.log = logEscalator(log.child(childOptions))
        req.log.debug({ req }, 'begin request')
        req.startTime = now()
        res.req = req

        res.on('finish', onResFinished)
        res.on('close', onResClose)
        res.on('error', onResFinished)

        if (next) {
            next()
        }
    }
}
