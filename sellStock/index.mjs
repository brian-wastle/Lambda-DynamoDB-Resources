import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const dynamicTableName = process.env.ENTRY_TABLE_NAME;
    const staticTableName = process.env.STATIC_TABLE_NAME;
    const LSIName = process.env.LSI_NAME;
    const { userID, ticker, amount } = event;
    let currentDate = new Date();
    let isoDate = currentDate.toISOString();
    

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
            KeyConditionExpression: 'userID = :userID',
            FilterExpression: 'metadata = :metadata',
            ExpressionAttributeValues: {
                ':userID': userID, // Replace with the actual userID
                ':metadata': 'PORTFOLIO#KEY' // Replace with the actual metadata value
            },
            ScanIndexForward: false,
            Limit: 1
        };
        const portfolioQueryCommand = new QueryCommand(portfolioQueryParams);
        const portfolioQueryResult = await dynamoClient.send(portfolioQueryCommand);
        console.log('portfolioQueryResult: ', portfolioQueryResult);
    
    // Get user's most recent transaction for ticker
        const tickerQueryParams = {
            TableName: dynamicTableName,
            IndexName: LSIName,
            KeyConditionExpression: 'userID = :userID',
            FilterExpression: 'metadata = :metadata',
            ExpressionAttributeValues: {
                ':userID': userID, // Replace with the actual userID
                ':metadata': 'PORTFOLIO#KEY' // Replace with the actual metadata value
            },
            ScanIndexForward: false,
            Limit: 1
        };
        const tickerQueryCommand = new QueryCommand(tickerQueryParams);
        const tickerQueryResult = await dynamoClient.send(tickerQueryCommand);
        console.log('tickerQueryResult: ', tickerQueryResult);

    // Create a new entry for stock purchase
        const mostRecentItem = stockQueryResult.Items[0];
        const stockPrice = parseFloat(mostRecentItem.price.N); // <--- CURRENT STOCK PRICE AS NUMBER
        const units = amount / stockPrice;
        const uuid = uuidv4();
        const buyMetadata = `${ticker}#BUY`;
        let portfolio = portfolioQueryResult.Items.portfolio || [];
        let newPortfolioBalance = 0;

        // Check user's current stock balance
        if (portfolio.includes(ticker)) {
            //Query the latest stock purchase or sale for this ticker
            const currentStockQueryParams = {
                TableName: dynamicTableName,
                IndexName: LSIName,
                KeyConditionExpression: 'userID = :userID',
                FilterExpression: 'begins_with(metadata, :metaData)',
                ExpressionAttributeValues: {
                    ':userID': userID, // Replace with the actual userID
                    ':metadata': ticker // Replace with the actual metadata value
                },
                ScanIndexForward: false,
                Limit: 1
            };
            const currentStockQueryCommand = new QueryCommand(currentStockQueryParams);
            const currentStockQueryResult = await dynamoClient.send(currentStockQueryCommand);

            // Calculate new balances
            const lastTickerTransaction = currentStockQueryResult.Items[0];
            newPortfolioBalance = lastTickerTransaction.balance + units.toFixed(3);
        } else {
            portfolio.push(ticker);
            newPortfolioBalance = units.toFixed(3);
        }
        
        // Create new purchase entry in db
        const putParams = {
            TableName: dynamicTableName,
            Item: {
                userID: {S: userID},
                date: {S: isoDate},
                metadata: {S: buyMetadata},
                value: {N: stockPrice.toFixed(2)},  
                units: {N: units.toFixed(3)},
                balance: {N: newPortfolioBalance},
                uuid: {S: uuid}
            }
        };
        const putCommand = new PutItemCommand(putParams);
        await dynamoClient.send(putCommand);

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
            if (lastAccountItem.value && lastAccountItem.value.N) {
                accountBalance = parseFloat(lastAccountItem.value.N);
            }
        } else {
            console.log('No account entries found.');
        }

        // Update the new account balance after deposit
        currentDate = new Date();
        isoDate = currentDate.toISOString();
        const withdrawAmount = `-${amount}`;
        const newAccountBalance = accountBalance - amount;
        const withdrawParams = {
            TableName: dynamicTableName,
            Item: {
                userID: {S: userID},
                date: {S: isoDate},
                metadata: {S: 'ACCOUNT#WITHDRAW'},
                value: {N: withdrawAmount},
                units: {N: '0'},
                balance: {N: newAccountBalance.toString()},
                uuid: {S: uuid}
            }
        };

        const withdrawCommand = new PutItemCommand(withdrawParams);
        await dynamoClient.send(withdrawCommand);

    // Update the user's portfolio array key if necessary
        const startDate = portfolioQueryResult.Items.date;
        const putPortfolioParams = {
            TableName: dynamicTableName,
            Item: {
                userID: {S: userID},
                date: {S: startDate},
                metadata: {S: 'PORTFOLIO#KEY'},
                portfolio: {L: portfolio},
                balance: {S: accountBalance}
            }
        };
        const putPortfolioCommand = new PutItemCommand(putPortfolioParams);
        await dynamoClient.send(putPortfolioCommand);

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
