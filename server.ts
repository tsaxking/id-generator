import express, { NextFunction } from 'express';
import { Server } from 'socket.io';
import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import ObjectsToCsv from 'objects-to-csv';
import { getClientIp } from 'request-ip';
import { Session } from './server-functions/structure/sessions';
import builder from './server-functions/page-builder';
import { emailValidation } from './server-functions/middleware/spam-detection';
import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import { config } from 'dotenv';
import './server-functions/declaration-merging/express.d.ts';
import { Status } from './server-functions/structure/status';
import Account from './server-functions/structure/accounts';

config();

declare global {
    namespace Express {
        interface Request {
            session: Session;
            start: number;
            io: Server;
        }
    }
}


const { PORT, DOMAIN } = process.env;

const [,, env, ...args] = workerData?.args || process.argv;


const app = express();

const server = http.createServer(app);


app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '50mb' }));
app.use('/static', express.static(path.resolve(__dirname, './static')));
app.use('/uploads', express.static(path.resolve(__dirname, './uploads')));


app.use((req, res, next) => {
    req.start = Date.now();
    console.log(req.ip);

    next();
});

function stripHtml(body: any) {
    let files: any;

    if (body.files) {
        files = JSON.parse(JSON.stringify(body.files));
        delete body.files;
    }

    let obj: any = {};

    const remove = (str: string) => str.replace(/(<([^>]+)>)/gi, '');

    const strip = (obj: any) => {
        switch (typeof obj) {
            case 'string':
                return remove(obj);
            case 'object':
                if (Array.isArray(obj)) {
                    return obj.map(strip);
                }
                for (const key in obj) {
                    obj[key] = strip(obj[key]);
                }
                return obj;
            default:
                return obj;
        }
    }


    obj = strip(body);

    if (files) {
        obj.files = files;
    }

    return obj;
}

// logs body of post request
app.post('/*', (req, res, next) => {
    req.body = stripHtml(req.body);
    next();
});

app.use(Session.middleware as NextFunction);



// production/testing/development middleware


app.use((req, res, next) => {
    switch (env) {
        case 'prod':
            (() => {
                // This code will only run in production


            })();
            break;
        case 'test':
            (() => {
                // this code will only run in testing
                // you could add features like auto-reloading, automatic sign-in, etc.


            })();
            break;
        case 'dev':
            (() => {
                // this code will only run in development
                // you could add features like auto-reloading, automatic sign-in, etc.


            })();
            break;
    }

    next();
});


// spam detection
// app.post('/*', detectSpam(['message', 'name', 'email'], {
//     onSpam: (req, res, next) => {
//         res.json({ error: 'spam' });
//     },
//     onerror: (req, res, next) => {
//         res.json({ error: 'error' });
//     }
// } as Options));

// app.post('/*', emailValidation(['email', 'confirmEmail'], {
//     onspam: (req, res, next) => {
//         res.json({ error: 'spam' });
//     },
//     onerror: (req, res, next) => {
//         res.json({ error: 'error' });
//     }
// }));





// █▀▄ ██▀ ▄▀▄ █ █ ██▀ ▄▀▀ ▀█▀ ▄▀▀ 
// █▀▄ █▄▄ ▀▄█ ▀▄█ █▄▄ ▄█▀  █  ▄█▀ 

// this can be used to build pages on the fly and send them to the client
// app.use(builder);


// import accounts from './server-functions/routes/account';
// app.use('/account', accounts);


// app.use(async (req, res, next) => {
//     const username = process.env.AUTO_SIGN_IN as string;
//     // if auto sign in is enabled, sign in as the user specified in the .env file
//     if (env !== 'prod' && username && req.session.account?.username !== username) {
//         const account = await Account.fromUsername(username as string);
//         if (account) {
//             req.session.signIn(account);
//         }
//     }
//     next();
// });


// app.use((req, res, next) => {
//     if (!req.session.account) {
//         return Status.from('account.notLoggedIn', req).send(res);
//     }
//     next();
// });




// █▀▄ ▄▀▄ █ █ ▀█▀ █ █▄ █ ▄▀  
// █▀▄ ▀▄▀ ▀▄█  █  █ █ ▀█ ▀▄█ 


import admin from './server-functions/routes/admin';
import { getTemplateSync, getJSON, log, LogType } from './server-functions/files';
import { uuid } from './server-functions/structure/uuid';
app.use('/admin', admin);










type Link = {
    name: string;
    html: string;
    icon: string;
    pathname: string;
    scripts: string[];
    styles: string[];
    keywords: string[];
    description: string;
    screenInfo: {
        size: string;
        color: string
    };
    prefix: string;
    display: boolean;
    permission?: string;
};







app.post('/uuid', (req, res, next) => {
    const { n, apiKey } = req.body;
    if (apiKey !== process.env.API_KEY) {
        return res.json({ error: 'Invalid API Key' });
    }
    const ids = new Array(Math.round(n)).fill('').map(() => uuid());
    res.json(ids);
    next();
});




type Log = {
    date: number,
    duration: number,
    ip?: string|null,
    method: string,
    url: string,
    status: number,
    userAgent?: string,
    body: string,
    params: string,
    query: string
}


let logCache: Log[] = [];

// sends logs to client every 10 seconds
// setInterval(() => {
//     if (logCache.length) {
//         io.to('logs').emit('request-logs', logCache);
//         logCache = [];
//     }
// }, 1000 * 10);

app.use((req, res, next) => {
    const csvObj: Log = {
        date: Date.now(),
        duration: Date.now() - req.start,
        ip: req.session.ip,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        userAgent: req.headers['user-agent'],
        body: req.method == 'post' ? JSON.stringify((() => {
            let { body } = req;
            body = JSON.parse(JSON.stringify(body));
            delete body.password;
            delete body.confirmPassword;
            delete body.files;
            return body;
        })()) : '',
        params: JSON.stringify(req.params),
        query: JSON.stringify(req.query)
    };

    logCache.push(csvObj);

    log(LogType.request, csvObj);
});



const clearLogs = () => {
    fs.writeFileSync('./logs.csv', '');
    logCache = [];
}

const timeTo12AM = 1000 * 60 * 60 * 24 - Date.now() % (1000 * 60 * 60 * 24);
console.log('Clearing logs in', timeTo12AM / 1000 / 60, 'minutes');
setTimeout(() => {
    clearLogs();
    setInterval(clearLogs, 1000 * 60 * 60 * 24);
}, timeTo12AM);


server.listen(PORT, () => {
    console.log('------------------------------------------------');
    console.log(`Listening on port \x1b[35m${DOMAIN}...\x1b[0m`);
});

parentPort?.on('message', (msg) => {
    switch(msg) {
        case 'clear-logs':
            clearLogs();
            break;
        case 'stop':
            console.log('Closing server...');
            process.exit(0);
            break;
    }
});