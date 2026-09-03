import { IsIn } from 'class-validator';

export class RespondDto {
  @IsIn(['stay', 'drop'])
  action: 'stay' | 'drop';
}
