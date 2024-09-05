import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';

const dynamoClient = new DynamoDBClient({ region: 'us-east-1' });

export const handler = async (event) => {
    const tableName = process.env.TABLE_NAME; 
    const partitionKey = 'userID'; 
    const currentDate = new Date();
    const sortKey = currentDate.toISOString();
    const { userID, filterValue } = event;

    // Validate input
    if (typeof userID !== 'string' || typeof filterValue !== 'string') {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Bad Request: Invalid input type.' })
        };
    }

    try {
        // Define query parameters
        const queryParams = {
            TableName: tableName,
            KeyConditionExpression: `${partitionKey} = :userID AND begins_with(${sortKeyPrefix}, :filterValue)`,
            ExpressionAttributeValues: {
                ':userID': { S: userID },
                ':filterValue': { S: filterValue }
            },
            ScanIndexForward: true, // Controls the order of results
            Limit: 10 // Limit the number of results returned
        };

        console.log("Query Parameters:", queryParams);

        // Execute query
        const queryCommand = new QueryCommand(queryParams);
        const queryResult = await dynamoClient.send(queryCommand);

        if (queryResult.Items.length === 0) {
            console.log("No matching items found.");
            return {
                statusCode: 404,
                body: JSON.stringify({ error: 'No matching items found.' })
            };
        }

        console.log("Query Result:", queryResult.Items);

        // Return successful response
        return {
            statusCode: 200,
            body: JSON.stringify(queryResult.Items),
            headers: {
                'Content-Type': 'application/json'
            }
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Internal Server Error' }),
            headers: {
                'Content-Type': 'application/json'
            }
        };
    }
};
