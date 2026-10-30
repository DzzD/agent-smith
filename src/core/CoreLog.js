/**
 * AppCoreJS Framework
 * CORE LAYER
 * NOT INTENDED TO BE MODIFIED IN APPLICATION PROJECTS
 * Copyright (c) 2026 Bruno Augier
 * Licensed under the MIT License
 */

export class CoreLog
{
    static modes =
    {
        debug: 0,
        info: 1,
        warn: 2,
        error: 3
    };

    static colors =
    {
        reset: '\x1b[0m',
        debug: '\x1b[90m', // gray
        info: '\x1b[36m',  // cyan
        warn: '\x1b[33m',  // yellow
        error: '\x1b[31m'  // red
    };

    static color = true;
    static exclusions = [];
    static #mode = CoreLog.modes.debug;

    static exclude(...patterns)
    {
        this.exclusions = patterns.map((pattern) => pattern instanceof RegExp ? pattern : new RegExp(pattern));
    }

    static clearExclusions()
    {
        this.exclusions = [];
    }

    static _isExcluded(args)
    {
        const message = typeof args[0] === 'string' ? args[0] : '';

        return this.exclusions.some((pattern) =>
        {
            pattern.lastIndex = 0;

            if (pattern.test(message))
            {
                return true;
            }

            pattern.lastIndex = 0;

            return pattern.test(message.replace(/^\[/, ''));
        });
    }

    static set mode(mode)
    {
        if (typeof mode === 'number')
        {
            if (!Object.values(CoreLog.modes).includes(mode))
            {
                throw new Error('Invalid log mode: ' + mode);
            }

            CoreLog.#mode = mode;

            return;
        }

        if (typeof mode === 'string' && Object.prototype.hasOwnProperty.call(CoreLog.modes, mode))
        {
            CoreLog.#mode = CoreLog.modes[mode];

            return;
        }

        throw new Error('Invalid log mode: ' + mode);
    }

    static setColor(enabled)
    {
        CoreLog.color = Boolean(enabled);
    }

    static #formatArgs(level, args)
    {
        if (!CoreLog.color)
        {
            return args;
        }

        const color = CoreLog.colors[level] ?? '';
        const reset = CoreLog.colors.reset;

        return args.map((arg) =>
        {
            if (typeof arg === 'string')
            {
                return `${color}${arg}${reset}`;
            }

            return arg;
        });
    }

    static debug(...args)
    {
        if (CoreLog.#mode > CoreLog.modes.debug || this._isExcluded(args))
        {
            return;
        }

        console.debug(...CoreLog.#formatArgs('debug', args));
    }

    static info(...args)
    {
        if (CoreLog.#mode > CoreLog.modes.info || this._isExcluded(args))
        {
            return;
        }

        console.info(...CoreLog.#formatArgs('info', args));
    }

    static warn(...args)
    {
        if (CoreLog.#mode > CoreLog.modes.warn || this._isExcluded(args))
        {
            return;
        }

        console.warn(...CoreLog.#formatArgs('warn', args));
    }

    static error(...args)
    {
        if (CoreLog.#mode > CoreLog.modes.error || this._isExcluded(args))
        {
            return;
        }

        console.error(...CoreLog.#formatArgs('error', args));
    }
}
