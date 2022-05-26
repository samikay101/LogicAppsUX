import type { JsonInputStyle } from '../../jsonToMapDefinitionParser';

export const missingDstSchemaJsonMock: JsonInputStyle = {
  srcSchemaName: 'SrcOrders.xsd',
  mappings: {
    targetNodeKey: '/ns0:CustomerOrders',
    targetValue: {
      value: '/ns0:Orders/@Item',
    },
  },
};
