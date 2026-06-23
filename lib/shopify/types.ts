export interface ShopifyVariant {
  id: number;
  title: string;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  sku: string | null;
  price: string;   // string like "12.99"
  available: boolean;
  inventory_quantity?: number;
}

export interface ShopifyImage {
  src: string;
  width?: number;
  height?: number;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  product_type: string;
  vendor: string;
  tags: string[];
  variants: ShopifyVariant[];
  images: ShopifyImage[];
}

export interface ShopifyProductsPage {
  products: ShopifyProduct[];
}
