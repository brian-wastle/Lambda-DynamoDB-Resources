import { DynamoDBClient, QueryCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const dynamicTableName = process.env.ENTRY_TABLE_NAME;
    const staticTableName = process.env.STATIC_TABLE_NAME;
    const LSIName = process.env.LSI_NAME;
    const { userID } = event;
    
    if (typeof userID !== 'string') {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Bad Request: Invalid input type.' })
        };
    }
    
    try {
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
        const portfolioQueryResult = await dynamoClient.send(portfolioQueryCommand);
        const portfolio = portfolioQueryResult.Items?.[0]?.portfolio?.SS ?? [];

        // Fetch balance and price for each ticker
        const results = [];
        for (const ticker of portfolio) {
            // get latest stock balance
            const currentTickerQueryParams = {
                TableName: dynamicTableName,
                IndexName: LSIName,
                KeyConditionExpression: 'userID = :userID AND begins_with(metadata, :metadata)',
                ExpressionAttributeValues: {
                    ':userID': { S: userID },
                    ':metadata': { S: `${ticker}#` }
                },
                ScanIndexForward: false,
                ConsistentRead: true
            };
            let stockBalance = 0;
            try {
                const currentTickerQueryCommand = new QueryCommand(currentTickerQueryParams);
                const currentTickerQueryResult = await dynamoClient.send(currentTickerQueryCommand);
                const latestTickerTransaction = findMostRecentItem(currentTickerQueryResult.Items, 'date');
                stockBalance = parseFloat(latestTickerTransaction?.balance?.N ?? '0');
            } catch (error) {
                console.error(`DynamoDB error for ticker ${ticker}:`, error);
            }

            // get current stock price
            const stockQueryParams = {
                TableName: staticTableName,
                KeyConditionExpression: 'ticker = :ticker',
                ExpressionAttributeValues: {
                    ':ticker': { S: ticker }
                },
                ScanIndexForward: false,
                Limit: 5,
                ConsistentRead: true
            };
            let stockPrice = null;
            try {
                const stockQueryCommand = new QueryCommand(stockQueryParams);
                const stockQueryResult = await dynamoClient.send(stockQueryCommand);
                const latestStockPrice = findMostRecentItem(stockQueryResult.Items, 'date');
                stockPrice = parseFloat(latestStockPrice?.price?.N ?? '0');
            } catch (error) {
                console.error(`DynamoDB error for ticker ${ticker}:`, error);
            }

            // Push the results
            results.push({ ticker, balance: stockBalance, price: stockPrice });
        }

        return {
            statusCode: 200,
            body: JSON.stringify(results)
        };
        
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' })
        };
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
    


    

