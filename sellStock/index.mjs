import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const dynamicTableName = process.env.ENTRY_TABLE_NAME;
    const staticTableName = process.env.STATIC_TABLE_NAME;
    const LSIName = process.env.LSI_NAME;
    const { userID, ticker, amount } = event;
    

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
            Limit: 1
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
        const tickerValue = amount * stockPrice;
        const sellMetadata = `${ticker}#SELL`;
        
        const uuid = uuidv4();

    // Get user's most recent transaction for ticker
        const tickerQueryParams = {
                TableName: dynamicTableName,
                IndexName: LSIName,
                KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :metadata)',
                ExpressionAttributeValues: {
                    ':userID': { S: userID },
                    ':metadata': {S: `${ticker}#`}
                },
                ScanIndexForward: false,
                Limit: 1
            };
        try {
            const tickerQueryCommand = new QueryCommand(tickerQueryParams);
            var tickerQueryResult = await dynamoClient.send(tickerQueryCommand);
        } catch (error) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'No units in portfolio for this ticker.' })
            };
        }
        console.log("tickerQueryResult:", tickerQueryResult);
        const tickerUnitBalance = tickerQueryResult.Items[0]?.balance.N;
        const units = tickerUnitBalance - amount;
        let currentDate = new Date();
        let isoDate = currentDate.toISOString();
        console.log(tickerUnitBalance);
        let portfolio = [];
        if (portfolioQueryResult.Items?.length > 0) {
            const portfolioItem = portfolioQueryResult.Items[0];
            if (portfolioItem.portfolio && portfolioItem.portfolio.SS) {
                portfolio = portfolioItem.portfolio.SS;
            }
        }
        console.log("units: ", units);
        console.log("tickerUnitBalance: ", tickerUnitBalance);
        console.log("amount: ", amount);
    // Create a new entry for stock purchase
        if (units < 0) {
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'Amount requested exceeds available units in portfolio.' })
            };
        } else if (units == 0) {
            // Update the user's portfolio array key if necessary
            const startDate = portfolio.length > 0 ? portfolioQueryResult.Items[0].date.S : isoDate;
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
        console.log("testing tickerValue:", tickerValue.toString());
        console.log("testing amount:", amount.toFixed(3).toString());
        console.log("testing units:", units.toFixed(3).toString());
        // Create new purchase entry in db
        currentDate = new Date();
        isoDate = currentDate.toISOString();
        const sellPutParams = {
            TableName: dynamicTableName,
            Item: {
                userID: {S: userID},
                date: {S: isoDate},
                metadata: {S: sellMetadata},
                value: {N: tickerValue.toFixed(2).toString()},  
                units: {N: amount.toFixed(3).toString()},
                balance: {N: units.toFixed(3).toString()},
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
            Limit: 1
        };

        const accountQueryCommand = new QueryCommand(accountQueryParams);
        const accountQueryResult = await dynamoClient.send(accountQueryCommand);

        var accountBalance = 0;
        if (accountQueryResult.Items.length > 0) {
            let lastAccountItem = accountQueryResult.Items[0];
            if (lastAccountItem.balance && lastAccountItem.balance.N) {
                accountBalance = parseFloat(lastAccountItem.balance.N) + tickerValue;
            }
        } else {
            console.log('No account entries found.');
        }

        // Update the new account balance after deposit
        currentDate = new Date();
        isoDate = currentDate.toISOString();
        const withdrawParams = {
            TableName: dynamicTableName,
            Item: {
                userID: {S: userID},
                date: {S: isoDate},
                metadata: {S: 'ACCOUNT#DEPOSIT'},
                value: {N: tickerValue.toFixed(2).toString()},
                units: {N: '0'},
                balance: {N: accountBalance.toString()},
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
};
