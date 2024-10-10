import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const dynamicTableName = process.env.ENTRY_TABLE_NAME;
    const staticTableName = process.env.STATIC_TABLE_NAME;
    const LSIName = process.env.LSI_NAME;
    const { userID, ticker, amount } = JSON.parse(event.body);
    

    if (typeof userID !== 'string' || typeof ticker !== 'string' || typeof amount !== 'number' || amount <= 0) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Bad Request: Invalid input type.' })
        };
    }
    
    try {
    // Grab the most recent stock price from StockDB
        const stockQueryParams = {
            TableName: staticTableName,
            KeyConditionExpression: 'ticker = :ticker',
            ExpressionAttributeValues: {
                ':ticker': { S: ticker }
            },
            ScanIndexForward: false,
            Limit: 1
        };
        const stockQueryCommand = new QueryCommand(stockQueryParams);
        const stockQueryResult = await dynamoClient.send(stockQueryCommand);
        if (stockQueryResult.Items.length === 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Stock price not found for the ticker.' })
            };
        }
    
    // Pull user's PORTFOLIO#KEY metadata
        const portfolioQueryParams = {
            TableName: dynamicTableName,
            IndexName: LSIName,
            KeyConditionExpression: 'userID = :userID AND metadata = :metadata',
            ExpressionAttributeValues: {
                ':userID': { S: userID },
                ':metadata': { S: 'PORTFOLIO#KEY' }
            },
            ScanIndexForward: false,
            Limit: 1,
            ConsistentRead: true
        };
        const portfolioQueryCommand = new QueryCommand(portfolioQueryParams);
        try {
            var portfolioQueryResult = await dynamoClient.send(portfolioQueryCommand);
        } catch (error) {
            console.log("error: ", error);
            var portfolioQueryResult = [];
        }
    
        const mostRecentItem = stockQueryResult.Items[0];
        const stockPrice = parseFloat(mostRecentItem.price.N); // <--- CURRENT STOCK PRICE AS NUMBER
        const uuid = uuidv4();
        const sellMetadata = `${ticker}#SELL`;
        let portfolio = portfolioQueryResult.Items?.[0]?.portfolio?.SS ?? [];
        let currentDate = new Date();
        let isoDate = currentDate.toISOString();
        const startDate = portfolioQueryResult.Items.length > 0 ? portfolioQueryResult.Items[0].date.S : isoDate;
    
    // Create a new entry for stock sale
        // Get user's most recent transaction for this ticker
        const tickerQueryParams = {
            TableName: dynamicTableName,
            IndexName: LSIName,
            KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :metadata)',
            ExpressionAttributeValues: {
                ':userID': {S: userID},
                ':metadata': {S: `${ticker}#`}
            },
            ScanIndexForward: false,
            ConsistentRead: true
        };
        const tickerQueryCommand = new QueryCommand(tickerQueryParams);
        try {
            const tickerQueryResult = await dynamoClient.send(tickerQueryCommand);
            const latestTickerTransaction = findMostRecentItem(tickerQueryResult.Items, 'date');
            const stockBalance = parseFloat(latestTickerTransaction?.balance?.N ?? 0);
            var newTickerBalance = (stockBalance - amount).toFixed(3);
        } catch (error) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'No units in portfolio for this ticker.' })
            };
        }

        // Handle a zero unit balance for current ticker
        if (newTickerBalance < 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Amount requested exceeds available units in portfolio.' })
            };
        } else if (newTickerBalance == 0) {
            // Update the user's portfolio key if necessary
            const tickerIndex = portfolio.indexOf(ticker);
            portfolio.splice(tickerIndex, 1);

            const putPortfolioParams = {
                TableName: dynamicTableName,
                Item: {
                    userID: {S: userID},
                    date: {S: startDate},
                    metadata: {S: 'PORTFOLIO#KEY'},
                    portfolio: {SS: portfolio},
                }
            };
            const putPortfolioCommand = new PutItemCommand(putPortfolioParams);
            await dynamoClient.send(putPortfolioCommand);
        }

        // Create new purchase entry in db
        const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
        await delay(1);
        currentDate = new Date();
        isoDate = currentDate.toISOString();
        const roundedAmount = roundUnits(amount);
        const roundedBalance = roundUnits(newTickerBalance);
        const sellPutParams = {
            TableName: dynamicTableName,
            Item: {
                userID: {S: userID},
                date: {S: isoDate},
                metadata: {S: sellMetadata},
                value: {N: stockPrice.toFixed(2)},  
                units: {N: roundedAmount.toFixed(3)},
                balance: {N: roundedBalance.toFixed(3)},
                uuid: {S: uuid}
            }
        };
        const sellPutCommand = new PutItemCommand(sellPutParams);
        await dynamoClient.send(sellPutCommand);

    // Add an entry for ACCOUNT#DEPOSIT metadata
        // Get the current account balance
        const accountQueryParams = {
            TableName: dynamicTableName,
            IndexName: LSIName,
            KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :skPrefix)',
            ExpressionAttributeValues: {
                ':userID': {S: userID},
                ':skPrefix': {S: 'ACCOUNT#'}
            },
            ScanIndexForward: false,
            ConsistentRead: true
        };
        const accountQueryCommand = new QueryCommand(accountQueryParams);
        const accountQueryResult = await dynamoClient.send(accountQueryCommand);

        // Find the most recent item by date
        let accountBalance = 0;
        let latestAccountTransaction = null;
        if (accountQueryResult.Items.length > 0) {
            latestAccountTransaction = findMostRecentItem(accountQueryResult.Items, 'date');
            accountBalance = parseFloat(latestAccountTransaction?.balance?.N ?? '0');
        } else {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'No cash account exists for this user. Try making an initial deposit first.' })
            };
        }

        // Update the new account balance after deposit
        const accountDate = new Date();
        const accountIsoDate = accountDate.toISOString();
        const tickerValue = roundBalance(amount * stockPrice);
        const newBalance = roundBalance(accountBalance + tickerValue);

        const withdrawParams = {
            TableName: dynamicTableName,
            Item: {
                userID: {S: userID},
                date: {S: accountIsoDate},
                metadata: {S: 'ACCOUNT#DEPOSIT'},
                value: {N: tickerValue.toFixed(2)},
                units: {N: '0'},
                balance: {N: newBalance.toFixed(2)},
                uuid: {S: uuid}
            }
        };
        const withdrawCommand = new PutItemCommand(withdrawParams);
        await dynamoClient.send(withdrawCommand);

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Stock purchase and account withdrawal entries created successfully.' })
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
    }


    function roundUnits(num) {
        return Math.round(num * 1000) / 1000;
    }
    function roundBalance(num) {
        return Math.round(num * 100) / 100;
    }

    function findMostRecentItem(items, dateField) {
        if (!Array.isArray(items) || items.length === 0) {
            return null;
        }
        return items.reduce((latest, item) => {
            const itemDate = item[dateField]?.S; // Access the date field
            const latestDate = latest ? latest[dateField]?.S : null;
            if (!latestDate || (itemDate && itemDate > latestDate)) {
                return item;
            }
            return latest;
        }, null);
    }
};
