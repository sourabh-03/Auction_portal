import { IsPositive } from 'class-validator';

export class SubmitBidDto {
  @IsPositive()
  price: number;
}
