import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { v4 as uuidv4 } from 'uuid';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const dynamicTableName = process.env.ENTRY_TABLE_NAME;
    const staticTableName = process.env.STATIC_TABLE_NAME;
    const LSIName = process.env.LSI_NAME;
    const { userID, ticker, amount } = event;
    const currentDate = new Date();
    const isoDate = currentDate.toISOString();

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
        
        const mostRecentItem = stockQueryResult.Items[0];
        const stockPrice = parseFloat(mostRecentItem.price.N); // <--- CURRENT STOCK PRICE AS NUMBER
        const units = amount / stockPrice;
        const uuid = uuidv4();

        // Create a new entry for stock purchase
        const metadata = `${ticker}#BUY`;
        const putParams = {
            TableName: dynamicTableName,
            Item: {
                userID: {S: userID},
                date: {S: isoDate},
                metadata: {S: metadata},
                price: {N: stockPrice.toFixed(2)}, 
                amount: {N: amount.toFixed(2)},   
                units: {N: units.toFixed(3)},
                uuid: {S: uuid}
            }
        };

        const putCommand = new PutItemCommand(putParams);
        await dynamoClient.send(putCommand);

        // Add an entry for ACCOUNT#WITHDRAW metadata
        // Get the current account balance
        const accountQueryParams = {
            TableName: dynamicTableName,
            IndexName: LSIName,
            KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :skPrefix)',
            ExpressionAttributeValues: {
                ':userID': { S: userID },
                ':skPrefix': { S: 'ACCOUNT#' }
            },
            ScanIndexForward: false,
            Limit: 1
        };

        const accountQueryCommand = new QueryCommand(accountQueryParams);
        const accountQueryResult = await dynamoClient.send(accountQueryCommand);

        let accountBalance = 0;
        if (accountQueryResult.Items.length > 0) {
            const latestAccountItem = accountQueryResult.Items[0];
            if (latestAccountItem.balance && latestAccountItem.balance.N) {
                accountBalance = parseFloat(latestAccountItem.balance.N);
            }
        } else {
            console.log('No account entries found.');
        }

        // Update the new account balance after withdrawal
        const newAccountBalance = accountBalance - amount;
        const negativeChange = `-${amount}`;
        const withdrawParams = {
            TableName: dynamicTableName,
            Item: {
                userID: { S: userID },
                date: { S: isoDate },
                metadata: { S: 'ACCOUNT#WITHDRAW' },
                price: { N: '0' },
                change: { N: negativeChange },
                balance: { N: newAccountBalance.toString() },
                units: {N: '0'},
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
