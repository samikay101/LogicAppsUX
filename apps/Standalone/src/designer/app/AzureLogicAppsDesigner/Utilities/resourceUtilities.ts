import { environment } from '../../../../environments/environment';
import { format } from '@microsoft/logic-apps-shared';
import axios from 'axios';

export const validateResourceId = (resourceId: string): string => {
  if (!resourceId) {
    throw new Error(format('Invalid Resource ID', resourceId));
  }

  return resourceId.startsWith('/') ? resourceId : `/${resourceId}`;
};

export const fetchAppsByQuery = async (query: string, subscriptions?: string[]): Promise<any[]> => {
  const requestPage = async (subscriptions?: string[], value: any[] = [], pageNum = 0, currentSkipToken = ''): Promise<any> => {
    try {
      const pageSize = 500;
      const { data } = await axios.post(
        'https://edge.management.azure.com/providers/Microsoft.ResourceGraph/resources?api-version=2021-03-01',
        {
          query,
          options: {
            $top: pageSize,
            $skip: pageSize * pageNum,
            $skipToken: currentSkipToken,
            resultFormat: 'table',
          },
          subscriptions,
        },
        {
          headers: {
            Authorization: `Bearer ${environment.armToken}`,
          },
        }
      );

      const $skipToken = data.$skipToken;
      const newValues = data.data.rows;
      value.push(...newValues);
      if ($skipToken && newValues.length !== 0) {
        return await requestPage(subscriptions, value, pageNum + 1, $skipToken);
      }
      return value;
    } catch (_e) {
      return value;
    }
  };
  return requestPage(subscriptions);
};
